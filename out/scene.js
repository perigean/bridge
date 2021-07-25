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
function trussMovingPinsCount(truss) {
    return truss.trainPins.length + truss.editPins.length;
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
        const beams = [...truss.trainBeams, ...truss.editBeams].map(b => ({
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
    drawBeam(ctx, p1, p2, w, style, deck);
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
        for (const b of truss.trainBeams) {
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
        for (const b of truss.trainBeams) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRy9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQWtCLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUF3QyxJQUFJLEVBQUUsR0FBRyxFQUFZLFFBQVEsRUFBa0IsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFnQixNQUFNLGNBQWMsQ0FBQztBQThDbE8sU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUNoQyxJQUFJ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QU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDdEIsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzVCLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUM3QixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDN0IsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQzdCLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUU3QiwwQkFBMEI7d0JBQzFCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxxQ0FBcUM7d0JBQ3pELE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7d0JBQ25CLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxnREFBZ0Q7d0JBQ3BFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7d0JBQ25CLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQzt3QkFDNUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQzt3QkFDckMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQ3BDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQzlCLElBQUksQ0FBQyxJ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QUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDdEMseUVBQXlFO3dCQUN6RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQ3BGLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxRQUFRLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQ25ELDRFQUE0RTt3QkFDNUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO3dCQUN0QyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM3RCxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7cUJBQ3BEO2lCQUNKO2FBQ0o7UUFDTCxDQUFDLENBQUE7UUFFRCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksV0FBVyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0s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TUFBTSxHQUFHLEdBQUcsQ0FBQztJQUNyQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUU1QixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQztJQUNoRCxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMxQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQy9DLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzFCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDcEMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTdCLEdBQUcsQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssR0FBRyxHQUFH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QUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUMsRUFDM0osSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDekssSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRTtRQUNoRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDM0MsQ0FBQyxDQUFDLENBQ0wsQ0FDSixDQUNKLENBQ0osQ0FBQztJQUVGLDBFQUEwRTtJQUUxRSw0RUFBNEU7SUFFNUUsZ0pBQWdKO0lBRWhKLHNCQUFzQjtJQUV0QixtREFBbUQ7SUFFbkQseUhBQXlIO0lBQ3pILGtIQUFrSDtJQUNsSCxtQkFBbUI7SUFFbkIsdUZBQXVGO0lBRXZGLGtCQUFrQjtJQUNsQixrREFBa0Q7SUFDbEQsNENBQTRDO0lBQzVDLHFGQUFxRjtJQUNyRiwyR0FBMkc7QUFDL0csQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHsgRGVyaXZhdGl2ZSB9IGZyb20gXCIuL29kZS5qc1wiO1xuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuL3BvaW50LmpzXCI7XG5pbXBvcnQgeyBSdW5nZUt1dHRhNCB9IGZyb20gXCIuL3JrNC5qc1wiO1xuaW1wb3J0IHsgYWRkQ2hpbGQsIEJvdHRvbSwgQm94LCBFbGVtZW50Q29udGV4dCwgRmlsbCwgRmxleCwgTGF5ZXIsIExheW91dEJveCwgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCwgTGVmdCwgTXV4LCBQYW5Qb2ludCwgUG9zaXRpb24sIFBvc2l0aW9uTGF5b3V0LCBSZWxhdGl2ZSwgcmVtb3ZlQ2hpbGQsIFNjcm9sbCwgU3dpdGNoLCBUaW1lckhhbmRsZXIgfSBmcm9tIFwiLi91aS9ub2RlLmpzXCI7XG5cbmV4cG9ydCB0eXBlIEJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjsgLy8gSW5kZXggb2YgcGluIGF0IGJlZ2lubmluZyBvZiBiZWFtLlxuICAgIHAyOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBlbmQgb2YgYmVhbS5cbiAgICBtOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtYXRlcmlhbCBvZiBiZWFtLlxuICAgIHc6IG51bWJlcjsgIC8vIFdpZHRoIG9mIGJlYW0uXG4gICAgbD86IG51bWJlcjsgLy8gTGVuZ3RoIG9mIGJlYW0sIG9ubHkgc3BlY2lmaWVkIHdoZW4gcHJlLXN0cmFpbmluZy5cbiAgICBkZWNrPzogYm9vbGVhbjsgLy8gSXMgdGhpcyBiZWFtIGEgZGVjaz8gKGRvIGRpc2NzIGNvbGxpZGUpXG59O1xuXG50eXBlIFNpbXVsYXRpb25CZWFtID0ge1xuICAgIHAxOiBudW1iZXI7XG4gICAgcDI6IG51bWJlcjtcbiAgICBtOiBudW1iZXI7XG4gICAgdzogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBkZWNrOiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBEaXNjID0ge1xuICAgIHA6IG51bWJlcjsgIC8vIEluZGV4IG9mIG1vdmVhYmxlIHBpbiB0aGlzIGRpc2Mgc3Vycm91bmRzLlxuICAgIG06IG51bWJlcjsgIC8vIE1hdGVyaWFsIG9mIGRpc2MuXG4gICAgcjogbnVtYmVyOyAgLy8gUmFkaXVzIG9mIGRpc2MuXG4gICAgdjogbnVtYmVyOyAgLy8gVmVsb2NpdHkgb2Ygc3VyZmFjZSBvZiBkaXNjIChpbiBDQ1cgZGlyZWN0aW9uKS5cbn07XG5cbmV4cG9ydCB0eXBlIE1hdGVyaWFsID0ge1xuICAgIEU6IG51bWJlcjsgIC8vIFlvdW5nJ3MgbW9kdWx1cyBpbiBQYS5cbiAgICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGtnL21eM1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICBtYXhMZW5ndGg6IG51bWJlcjtcbiAgICAvLyBUT0RPOiB3aGVuIHN0dWZmIGJyZWFrcywgd29yayBoYXJkZW5pbmcsIGV0Yy5cbn07XG5cbmV4cG9ydCB0eXBlIFRydXNzID0ge1xuICAgIGZpeGVkUGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgdHJhaW5QaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBlZGl0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgdHJhaW5CZWFtczogQXJyYXk8QmVhbT47XG4gICAgZWRpdEJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBkaXNjczogQXJyYXk8RGlzYz47XG4gICAgbWF0ZXJpYWxzOiBBcnJheTxNYXRlcmlhbD47XG59O1xuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzOiBUcnVzcywgbTogbnVtYmVyKSB7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGlmIChtIDwgMCB8fCBtID49IG1hdGVyaWFscy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1hdGVyaWFsIGluZGV4ICR7bX1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQXNzZXJ0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGggfHwgcGluID49IHRydXNzLnRyYWluUGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQmVhbUV4aXN0cyh0cnVzczogVHJ1c3MsIHAxOiBudW1iZXIsIHAyOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgYmVhbSBvZiB0cnVzcy50cmFpbkJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnRyYWluUGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNFbmQodHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIC10cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKF90cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiB0cnVzc01vdmluZ1BpbnNDb3VudCh0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy50cmFpblBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldENsb3Nlc3RQaW4odHJ1c3M6IFRydXNzLCBwOiBQb2ludDJELCBtYXhkOiBudW1iZXIsIHBpblN0YXJ0OiBudW1iZXIsIG1heExlbmd0aDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgICAvLyBUT0RPOiBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gUHJvYmFibHkgb25seSBtYXR0ZXJzIG9uY2Ugd2UgaGF2ZSAxMDAwcyBvZiBwaW5zP1xuICAgIGNvbnN0IHBTdGFydCA9IHRydXNzR2V0UGluKHRydXNzLCBwaW5TdGFydCk7XG4gICAgY29uc3QgYmxvY2sgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBsZXQgcmVzID0gdW5kZWZpbmVkO1xuICAgIGxldCByZXNkID0gbWF4ZDtcbiAgICBpZiAocGluU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MudHJhaW5CZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IHBpblN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBwaW5TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICBpZiAoYi5wMSA9PT0gcGluU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIucDIgPT09IHBpblN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChibG9jay5oYXMoaSAtIHRydXNzLmZpeGVkUGlucy5sZW5ndGgpIHx8IHBvaW50RGlzdGFuY2UocFN0YXJ0LCB0cnVzcy5maXhlZFBpbnNbaV0pID4gbWF4TGVuZ3RoKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5maXhlZFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGkgLSB0cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy50cmFpblBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGJsb2NrLmhhcyhpKSB8fCBwb2ludERpc3RhbmNlKHBTdGFydCwgdHJ1c3MudHJhaW5QaW5zW2ldKSA+IG1heExlbmd0aCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3MudHJhaW5QaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5lZGl0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYmxvY2suaGFzKGkgKyB0cnVzcy50cmFpblBpbnMubGVuZ3RoKSB8fCBwb2ludERpc3RhbmNlKHBTdGFydCwgdHJ1c3MuZWRpdFBpbnNbaV0pID4gbWF4TGVuZ3RoKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5lZGl0UGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSArIHRydXNzLnRyYWluUGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKTogUG9pbnQyRCB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLmZpeGVkUGluc1t0cnVzcy5maXhlZFBpbnMubGVuZ3RoICsgcGluXTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IHRydXNzLnRyYWluUGlucy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLnRyYWluUGluc1twaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIC0gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aCA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZWRpdFBpbnNbcGluIC0gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aF07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH1cbn1cblxuZXhwb3J0IHR5cGUgVGVycmFpbiA9IHtcbiAgICBobWFwOiBBcnJheTxudW1iZXI+O1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbn07XG5cbnR5cGUgU2ltdWxhdGlvbkhNYXAgPSBBcnJheTx7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgbng6IG51bWJlcjsgLy8gT3V0d2FyZCAoZGlyZWN0aW9uIG9mIGJvdW5jZSkgbm9ybWFsIHVuaXQgdmVjdG9yLlxuICAgIG55OiBudW1iZXI7XG4gICAgZGVja3M6IEFycmF5PFNpbXVsYXRpb25CZWFtPjsgICAvLyBVcGRhdGVkIGV2ZXJ5IGZyYW1lLCBhbGwgZGVja3MgYWJvdmUgdGhpcyBzZWdtZW50LlxuICAgIGRlY2tzTGVmdDogQXJyYXk8bnVtYmVyPjsgICAgICAgLy8gTGVmdG1vc3QgaW5kZXggaW4gaG1hcCBvZiBkZWNrIGF0IHNhbWUgaW5kZXggaW4gZGVja3MuXG4gICAgZGVja0NvdW50OiBudW1iZXI7ICAvLyBOdW1iZXIgb2YgaW5kaWNlcyBpbiBkZWNrcyBiZWluZyB1c2VkLlxufT47XG5cbnR5cGUgQWRkQmVhbUFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImFkZF9iZWFtXCI7XG4gICAgcDE6IG51bWJlcjtcbiAgICBwMjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbD86IG51bWJlcjtcbiAgICBkZWNrPzogYm9vbGVhbjtcbn07XG5cbnR5cGUgQWRkUGluQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiYWRkX3BpblwiO1xuICAgIHBpbjogUG9pbnQyRDtcbn07XG5cbnR5cGUgQ29tcG9zaXRlQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiY29tcG9zaXRlXCI7XG4gICAgYWN0aW9uczogQXJyYXk8VHJ1c3NBY3Rpb24+O1xufTtcblxudHlwZSBUcnVzc0FjdGlvbiA9IEFkZEJlYW1BY3Rpb24gfCBBZGRQaW5BY3Rpb24gfCBDb21wb3NpdGVBY3Rpb247XG5cblxuZXhwb3J0IHR5cGUgU2NlbmVKU09OID0ge1xuICAgIHRydXNzOiBUcnVzcztcbiAgICB0ZXJyYWluOiBUZXJyYWluO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgZzogUG9pbnQyRDsgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICByZWRvU3RhY2s6IEFycmF5PFRydXNzQWN0aW9uPjtcbiAgICB1bmRvU3RhY2s6IEFycmF5PFRydXNzQWN0aW9uPjtcbn1cblxuY2xhc3MgU2NlbmVTaW11bGF0b3Ige1xuICAgIHByaXZhdGUgbWV0aG9kOiBSdW5nZUt1dHRhNDsgICAgICAgICAgICAgICAgICAgIC8vIE9ERSBzb2x2ZXIgbWV0aG9kIHVzZWQgdG8gc2ltdWxhdGUuXG4gICAgcHJpdmF0ZSBkeWR0OiBEZXJpdmF0aXZlOyAgICAgICAgICAgICAgICAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBPREUgc3RhdGUuXG4gICAgcHJpdmF0ZSBoOiBudW1iZXI7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGltZSBzdGVwLlxuICAgIHByaXZhdGUgZml4ZWRQaW5zOiBGbG9hdDMyQXJyYXk7ICAgICAgICAgICAgICAgIC8vIFBvc2l0aW9ucyBvZiBmaXhlZCBwaW5zIFt4MCwgeTAsIHgxLCB5MSwgLi4uXS5cbiAgICBwcml2YXRlIHRMYXRlc3Q6IG51bWJlcjsgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgaGlnaGVzdCB0aW1lIHZhbHVlIHNpbXVsYXRlZC5cbiAgICBwcml2YXRlIGtleUludGVydmFsOiBudW1iZXI7ICAgICAgICAgICAgICAgICAgICAgIC8vIFRpbWUgcGVyIGtleWZyYW1lLlxuICAgIHByaXZhdGUga2V5ZnJhbWVzOiBNYXA8bnVtYmVyLCBGbG9hdDMyQXJyYXk+OyAgIC8vIE1hcCBvZiB0aW1lIHRvIHNhdmVkIHN0YXRlLlxuICAgIHByaXZhdGUgcGxheVRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gICAgcHJpdmF0ZSBwbGF5VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgcGxheVRpY2s6IFRpbWVySGFuZGxlcjtcblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04sIGg6IG51bWJlciwga2V5SW50ZXJ2YWw6IG51bWJlcikge1xuICAgICAgICB0aGlzLmggPSBoO1xuICAgICAgICB0aGlzLnRMYXRlc3QgPSAwO1xuICAgICAgICB0aGlzLmtleUludGVydmFsID0ga2V5SW50ZXJ2YWw7XG4gICAgICAgIHRoaXMua2V5ZnJhbWVzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnBsYXlUaW1lciA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5wbGF5VGltZSA9IDA7XG4gICAgICAgIHRoaXMucGxheVRpY2sgPSAobXM6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICAvLyBPbmx5IGNvbXB1dGUgdXAgdG8gMTAwbXMgb2YgZnJhbWVzIHBlciB0aWNrLCB0byBhbGxvdyBvdGhlciB0aGluZ3MgdG8gaGFwcGVuIGlmIHdlIGFyZSBiZWhpbmQuXG4gICAgICAgICAgICBsZXQgdDEgPSBNYXRoLm1pbih0aGlzLnBsYXlUaW1lICsgbXMgKiAwLjAwMSwgdGhpcy5tZXRob2QudCArIDAuMSk7XG4gICAgICAgICAgICB3aGlsZSAodGhpcy5tZXRob2QudCA8IHQxKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRydXNzID0gc2NlbmUudHJ1c3M7XG4gICAgICAgIFxuICAgICAgICAvLyBDYWNoZSBmaXhlZCBwaW4gdmFsdWVzLlxuICAgICAgICBjb25zdCBmaXhlZFBpbnMgPSBuZXcgRmxvYXQzMkFycmF5KHRydXNzLmZpeGVkUGlucy5sZW5ndGggKiAyKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5maXhlZFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZpeGVkUGluc1tpICogMl0gPSB0cnVzcy5maXhlZFBpbnNbaV1bMF07XG4gICAgICAgICAgICBmaXhlZFBpbnNbaSAqIDIgKyAxXSA9IHRydXNzLmZpeGVkUGluc1tpXVsxXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmZpeGVkUGlucyA9IGZpeGVkUGlucztcblxuICAgICAgICAvLyBDYWNoZSBCZWFtIHZhbHVlcy5cbiAgICAgICAgY29uc3QgYmVhbXM6IEFycmF5PFNpbXVsYXRpb25CZWFtPiA9IFsuLi50cnVzcy50cmFpbkJlYW1zLCAuLi50cnVzcy5lZGl0QmVhbXNdLm1hcChiID0+ICh7XG4gICAgICAgICAgICBwMTogYi5wMSxcbiAgICAgICAgICAgIHAyOiBiLnAyLFxuICAgICAgICAgICAgbTogYi5tLFxuICAgICAgICAgICAgdzogYi53LFxuICAgICAgICAgICAgbDogYi5sICE9PSB1bmRlZmluZWQgPyBiLmwgOiBwb2ludERpc3RhbmNlKHRydXNzR2V0UGluKHRydXNzLCBiLnAxKSwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDIpKSxcbiAgICAgICAgICAgIGRlY2s6IGIuZGVjayAhPT0gdW5kZWZpbmVkID8gYi5kZWNrIDogZmFsc2UsXG4gICAgICAgIH0pKTtcblxuICAgICAgICAvLyBDYWNoZSBkaXNjcy5cbiAgICAgICAgY29uc3QgZGlzY3MgPSB0cnVzcy5kaXNjczsgIC8vIFRPRE86IGRvIHdlIGV2ZXIgd25hdCB0byBtdXRhdGUgZGlzY3M/XG5cbiAgICAgICAgLy8gQ2FjaGUgbWF0ZXJpYWxzLlxuICAgICAgICBjb25zdCBtYXRlcmlhbHMgPSB0cnVzcy5tYXRlcmlhbHM7ICAvLyBUT0RPOiBkbyB3ZSBldmVyIHdhbnQgdG8gbXV0YXRlIG1hdGVyaWFscz9cblxuICAgICAgICAvLyBDb21wdXRlIHRoZSBtYXNzIG9mIGFsbCBwaW5zLlxuICAgICAgICBjb25zdCBtb3ZpbmdQaW5zID0gdHJ1c3NNb3ZpbmdQaW5zQ291bnQodHJ1c3MpO1xuICAgICAgICBjb25zdCBtYXNzID0gbmV3IEZsb2F0MzJBcnJheShtb3ZpbmdQaW5zKTtcbiAgICAgICAgZnVuY3Rpb24gYWRkTWFzcyhwaW46IG51bWJlciwgbTogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIC8vIEZpeGVkIHBpbnMgYWxyZWFkeSBoYXZlIGluZmluaXRlIG1hc3MuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWFzc1twaW5dICs9IG07XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gYi5sICogYi53ICogbWF0ZXJpYWxzW2IubV0uZGVuc2l0eTtcbiAgICAgICAgICAgIC8vIERpc3RyaWJ1dGUgdGhlIG1hc3MgYmV0d2VlbiB0aGUgdHdvIGVuZCBwaW5zLlxuICAgICAgICAgICAgLy8gVE9ETzogZG8gcHJvcGVyIG1hc3MgbW9tZW50IG9mIGludGVydGlhIGNhbGN1bGF0aW9uIHdoZW4gcm90YXRpbmcgYmVhbXM/XG4gICAgICAgICAgICBhZGRNYXNzKGIucDEsIG0gKiAwLjUpO1xuICAgICAgICAgICAgYWRkTWFzcyhiLnAyLCBtICogMC41KTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGQgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IG0gPSBkLnIgKiBkLnIgKiBNYXRoLlBJICogbWF0ZXJpYWxzW2QubV0uZGVuc2l0eTtcbiAgICAgICAgICAgIGFkZE1hc3MoZC5wLCBtKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDaGVjayB0aGF0IGV2ZXJ5dGhpbmcgdGhhdCBjYW4gbW92ZSBoYXMgc29tZSBtYXNzLlxuICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbWFzcykge1xuICAgICAgICAgICAgaWYgKG0gPD0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm1hc3MgMCBwaW4gZGV0ZWN0ZWRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYWNoZSB0aGUgdGVycmFpbiwgc2V0IHVwIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmUgZm9yIGRlY2sgaW50ZXJzZWN0aW9ucy5cbiAgICAgICAgY29uc3QgdEZyaWN0aW9uID0gc2NlbmUudGVycmFpbi5mcmljdGlvbjtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gc2NlbmUuaGVpZ2h0O1xuICAgICAgICBjb25zdCBwaXRjaCA9IHNjZW5lLndpZHRoIC8gKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKTtcbiAgICAgICAgY29uc3QgaG1hcDogU2ltdWxhdGlvbkhNYXAgPSBzY2VuZS50ZXJyYWluLmhtYXAubWFwKChoLCBpKSA9PiB7XG4gICAgICAgICAgICBpZiAoaSArIDEgPj0gc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgICAgICAgICAgbng6IDAuMCxcbiAgICAgICAgICAgICAgICAgICAgbnk6LTEuMCxcbiAgICAgICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgICAgICBkZWNrc0xlZnQ6IFtdLFxuICAgICAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGR5ID0gc2NlbmUudGVycmFpbi5obWFwW2kgKyAxXSAtIGg7XG4gICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgIG54OiBkeSAvIGwsXG4gICAgICAgICAgICAgICAgbnk6IC1waXRjaCAvIGwsXG4gICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgIGRlY2tzTGVmdDogW10sXG4gICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICAgIGZ1bmN0aW9uIGhtYXBBZGREZWNrKGk6IG51bWJlciwgbGVmdDogbnVtYmVyLCBkOiBTaW11bGF0aW9uQmVhbSkge1xuICAgICAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBoID0gaG1hcFtpXTtcbiAgICAgICAgICAgIGguZGVja3NbaC5kZWNrQ291bnRdID0gZDtcbiAgICAgICAgICAgIGguZGVja3NMZWZ0W2guZGVja0NvdW50XSA9IGxlZnQ7XG4gICAgICAgICAgICBoLmRlY2tDb3VudCsrO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBTdGF0ZSBhY2Nlc3NvcnNcbiAgICAgICAgY29uc3QgdkluZGV4ID0gbW92aW5nUGlucyAqIDI7XG4gICAgICAgIGZ1bmN0aW9uIGdldGR4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW4gKiAyXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW4gKiAyICsgMV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbdkluZGV4ICsgcGluICogMl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB5W3ZJbmRleCArIHBpbiAqIDIgKyAxXTsgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIHNldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICB5W3BpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVt2SW5kZXggKyBwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbdkluZGV4ICsgcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGZvcmNlKGR5ZHQ6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIGZ4OiBudW1iZXIsIGZ5OiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBtYXNzW3Bpbl07XG4gICAgICAgICAgICAgICAgZHlkdFt2SW5kZXggKyBwaW4gKiAyICsgMF0gKz0gZnggLyBtO1xuICAgICAgICAgICAgICAgIGR5ZHRbdkluZGV4ICsgcGluICogMiArIDFdICs9IGZ5IC8gbTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldCB1cCBpbml0aWFsIE9ERSBzdGF0ZS4gTkI6IHZlbG9jaXRpZXMgYXJlIGFsbCB6ZXJvLlxuICAgICAgICBjb25zdCB5MCA9IG5ldyBGbG9hdDMyQXJyYXkobW92aW5nUGlucyAqIDQpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdmluZ1BpbnM7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZCA9IHRydXNzR2V0UGluKHRydXNzLCBpKTtcbiAgICAgICAgICAgIHNldGR4KHkwLCBpLCBkWzBdKTtcbiAgICAgICAgICAgIHNldGR5KHkwLCBpLCBkWzFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhY2hlIGFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgY29uc3QgZyA9IHNjZW5lLmc7XG5cbiAgICAgICAgdGhpcy5keWR0ID0gZnVuY3Rpb24gZHlkeShfdDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIGR5ZHQ6IEZsb2F0MzJBcnJheSkge1xuICAgICAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBwb3NpdGlvbiBpcyB2ZWxvY2l0eS5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgc2V0ZHgoZHlkdCwgaSwgZ2V0dngoeSwgaSkpO1xuICAgICAgICAgICAgICAgIHNldGR5KGR5ZHQsIGksIGdldHZ5KHksIGkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRhbXBLID0gMTtcbiAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgc2V0dngoZHlkdCwgaSwgZ1swXSAtIGRhbXBLICogZ2V0dngoeSwgaSkpO1xuICAgICAgICAgICAgICAgIHNldHZ5KGR5ZHQsIGksIGdbMV0gLSBkYW1wSyAqIGdldHZ5KHksIGkpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRGVja3MgYXJlIHVwZGF0ZWQgaW4gaG1hcCBpbiB0aGUgYmVsb3cgbG9vcCB0aHJvdWdoIGJlYW1zLCBzbyBjbGVhciB0aGUgcHJldmlvdXMgdmFsdWVzLlxuICAgICAgICAgICAgZm9yIChjb25zdCBoIG9mIGhtYXApIHtcbiAgICAgICAgICAgICAgICBoLmRlY2tDb3VudCA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gYmVhbSBzdHJlc3MuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgICAgIC8vIEFkZCBkZWNrcyB0byBhY2NsZXJhdGlvbiBzdHJ1Y3R1cmVcbiAgICAgICAgICAgICAgICBpZiAoYmVhbS5kZWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGkxID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMSkgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMikgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJlZ2luID0gTWF0aC5taW4oaTEsIGkyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5tYXgoaTEsIGkyKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBobWFwQWRkRGVjayhpLCBiZWdpbiwgYmVhbSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHAxIDwgMCAmJiBwMiA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQm90aCBlbmRzIGFyZSBub3QgbW92ZWFibGUuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBFID0gbWF0ZXJpYWxzW2JlYW0ubV0uRTtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gYmVhbS53O1xuICAgICAgICAgICAgICAgIGNvbnN0IGwwID0gYmVhbS5sO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgcDIpIC0gZ2V0ZHgoeSwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgcDIpIC0gZ2V0ZHkoeSwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGsgPSBFICogdyAvIGwwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNwcmluZ0YgPSAobCAtIGwwKSAqIGs7XG4gICAgICAgICAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgICAgICAgICAgY29uc3QgdXkgPSBkeSAvIGw7XG5cbiAgICAgICAgICAgICAgICAvLyBCZWFtIHN0cmVzcyBmb3JjZS5cbiAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMSwgdXggKiBzcHJpbmdGLCB1eSAqIHNwcmluZ0YpO1xuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAyLCAtdXggKiBzcHJpbmdGLCAtdXkgKiBzcHJpbmdGKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byB0ZXJyYWluIGNvbGxpc2lvblxuICAgICAgICAgICAgLy8gVE9ETzogc2NlbmUgYm9yZGVyIGNvbGxpc2lvblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGkpOyAvLyBQaW4gcG9zaXRpb24uXG4gICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtID0gbWFzc1tpXTtcbiAgICAgICAgICAgICAgICBsZXQgYm91bmNlRiA9IDEwMDAuMCAqIG07IC8vIEZvcmNlIHBlciBtZXRyZSBvZiBkZXB0aCB1bmRlciB0ZXJyYWluLlxuICAgICAgICAgICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbCAoZGlyZWN0aW9uIG9mIGFjY2VsZXJhdGlvbikuXG4gICAgICAgICAgICAgICAgbGV0IG55O1xuICAgICAgICAgICAgICAgIGlmIChkeCA8IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICBueCA9IDAuMDtcbiAgICAgICAgICAgICAgICAgICAgbnkgPSAtMS4wO1xuICAgICAgICAgICAgICAgICAgICBib3VuY2VGICo9IGR5IC0gaGVpZ2h0ICsgaG1hcFswXS5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGkgPSBNYXRoLm1pbihobWFwLmxlbmd0aCAtIDEsIE1hdGguZmxvb3IoZHggLyBwaXRjaCkpO1xuICAgICAgICAgICAgICAgICAgICBueCA9IGhtYXBbdGldLm54O1xuICAgICAgICAgICAgICAgICAgICBueSA9IGhtYXBbdGldLm55O1xuICAgICAgICAgICAgICAgICAgICAvLyBEaXN0YW5jZSBiZWxvdyB0ZXJyYWluIGlzIG5vcm1hbCBkb3QgdmVjdG9yIGZyb20gdGVycmFpbiB0byBwb2ludC5cbiAgICAgICAgICAgICAgICAgICAgYm91bmNlRiAqPSAtKG54ICogKGR4IC0gdGkgKiBwaXRjaCkgKyBueSAqIChkeSAtIGhtYXBbdGldLmhlaWdodCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoYm91bmNlRiA8PSAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gV2UgYXJlIG5vdCBib3VuY2luZy5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGksIG54ICogYm91bmNlRiwgbnkgKiBib3VuY2VGKTtcblxuICAgICAgICAgICAgICAgIC8vIEZyaWN0aW9uLlxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbiBpbiBwcm9wb3J0aW9uIHRvIGF0LCBpbiBkaXJlY3Rpb24gb3Bwb3NpdGUgb2YgdGFuZ2VudCBwcm9qZWN0ZWQgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIGkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHYgPSB2eCAqIHR4ICsgdnkgKiB0eTtcbiAgICAgICAgICAgICAgICBsZXQgZnJpY3Rpb25GID0gdEZyaWN0aW9uICogYm91bmNlRiAqICh0diA+IDAgPyAtMSA6IDEpO1xuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGksIHR4ICogZnJpY3Rpb25GLCB0eSAqIGZyaWN0aW9uRik7XG5cbiAgICAgICAgICAgICAgICAvLyBPbGQgQ29kZVxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHdoeSBkaWQgdGhpcyBuZWVkIHRvIGNhcCB0aGUgYWNjZWxlcmF0aW9uPyBtYXliZSBib3VuY2UgZm9yY2UgaXMgdG9vIGhpZ2g/XG4gICAgICAgICAgICAgICAgLy9jb25zdCBhZiA9IE1hdGgubWluKHRGcmljdGlvbiAqIGF0LCBNYXRoLmFicyh0diAqIDEwMCkpICogKHR2ID49IDAuMCA/IC0xLjAgOiAxLjApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgciA9IGRpc2MucjtcbiAgICAgICAgICAgICAgICBjb25zdCBtID0gbWFzc1tkaXNjLnBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgZGlzYy5wKTtcbiAgICAgICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGhtYXAgYnVja2V0cyB0aGF0IGRpc2Mgb3ZlcmxhcHMuXG4gICAgICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKChkeCAtIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcigoZHggKyByKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gaTE7IGkgPD0gaTI7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVja3MgPSBobWFwW2ldLmRlY2tzO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWNrQ291bnQgPSBobWFwW2ldLmRlY2tDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkZWNrQ291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGkgIT09IE1hdGgubWF4KGkxLCBobWFwW2ldLmRlY2tzTGVmdFtqXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IGNvbXB1dGUgY29sbGlzaW9uIGlmIHRoZSBidWNrZXQgd2UgYXJlIGluIGlzIHRoZSBsZWZ0bW9zdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9uZSB0aGF0IGNvbnRhaW5zIGJvdGggdGhlIGRlY2sgYW5kIHRoZSBkaXNjLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVjayA9IGRlY2tzW2pdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBkaXNjLnApO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgeDEgPSBnZXRkeCh5LCBkZWNrLnAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHkxID0gZ2V0ZHkoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB4MiA9IGdldGR4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgeTIgPSBnZXRkeSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSXMgY29sbGlzaW9uIGhhcHBlbmluZz9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHN4ID0geDIgLSB4MTsgLy8gVmVjdG9yIHRvIGVuZCBvZiBkZWNrIChmcm9tIHN0YXJ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3kgPSB5MiAtIHkxO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3ggPSBkeCAtIHgxOyAvLyBWZWN0b3IgdG8gY2VudHJlIG9mIGRpc2MgKGZyb20gc3RhcnQgb2YgZGVjaylcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN5ID0gZHkgLSB5MTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBzeCAqIHN4ICsgc3kgKiBzeTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGIgPSAtMi4wICogKGN4ICogc3ggKyBjeSAqIHN5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGMgPSBjeCAqIGN4ICsgY3kgKiBjeSAtIHIgKiByO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgRCA9IGIgKiBiIC0gNC4wICogYSAqIGM7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoRCA8PSAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgICAvLyBObyBSZWFsIHNvbHV0aW9ucyB0byBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByb290RCA9IE1hdGguc3FydChEKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0ID0gLWIgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdDEgPSAoLWIgLSByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdDIgPSAoLWIgKyByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoKHQxIDw9IDAuMCAmJiB0MiA8PSAwLjApIHx8ICh0MSA+PSAxLjAgJiYgdDIgPj0gMC4wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIEludGVyc2VjdGlvbnMgYXJlIGJvdGggYmVmb3JlIG9yIGFmdGVyIGRlY2suXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0ID0gTWF0aC5tYXgoTWF0aC5taW4odCwgMS4wKSwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQxID0gTWF0aC5tYXgodDEsIDAuMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0MiA9IE1hdGgubWluKHQyLCAxLjApO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBjb2xsaXNpb24gYWNjZWxlcmF0aW9uLlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGlzIHByb3BvcnRpb25hbCB0byBhcmVhICdzaGFkb3dlZCcgaW4gdGhlIGRpc2MgYnkgdGhlIGludGVyc2VjdGluZyBkZWNrLlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBzbyB0aGF0IGFzIGEgZGlzYyBtb3ZlcyBiZXR3ZWVuIHR3byBkZWNrIHNlZ21lbnRzLCB0aGUgYWNjZWxlcmF0aW9uIHJlbWFpbnMgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0MXggPSAoMSAtIHQxKSAqIHgxICsgdDEgKiB4MiAtIGR4OyAgIC8vIENpcmNsZSBjZW50cmUgLT4gdDEgaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF5ID0gKDEgLSB0MSkgKiB5MSArIHQxICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeCA9ICgxIC0gdDIpICogeDEgKyB0MiAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MiBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0MnkgPSAoMSAtIHQyKSAqIHkxICsgdDIgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdGEgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHQxeSwgdDF4KSAtIE1hdGguYXRhbjIodDJ5LCB0MngpKSAlIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmVhID0gMC41ICogciAqIHIgKiB0YSAtIDAuNSAqIE1hdGguYWJzKHQxeCAqIHQyeSAtIHQxeSAqIHQyeCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmID0gMTAwMC4wICogbSAqIGFyZWEgLyByOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgdGhlIGZvcmNlLlxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG54ID0gY3ggLSBzeCAqIHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbnkgPSBjeSAtIHN5ICogdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQobnggKiBueCArIG55ICogbnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbnggLz0gbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIG55IC89IGw7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBcHBseSBmb3JjZSB0byB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGRpc2MucCwgbnggKiBmLCBueSAqIGYpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBkZWNrLnAxLCAtbnggKiBmICogKDEgLSB0KSwgLW55ICogZiAqICgxIC0gdCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgZGVjay5wMiwgLW54ICogZiAqIHQsIC1ueSAqIGYgKiB0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBmcmljdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEdldCByZWxhdGl2ZSB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgZGlzYy5wKSAtICgxLjAgLSB0KSAqIGdldHZ4KHksIGRlY2sucDEpIC0gdCAqIGdldHZ4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBkaXNjLnApIC0gKDEuMCAtIHQpICogZ2V0dnkoeSwgZGVjay5wMSkgLSB0ICogZ2V0dnkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2NvbnN0IHZuID0gdnggKiBueCArIHZ5ICogbnk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2dCA9IHZ4ICogdHggKyB2eSAqIHR5IC0gZGlzYy52O1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVG90YWxseSB1bnNjaWVudGlmaWMgd2F5IHRvIGNvbXB1dGUgZnJpY3Rpb24gZnJvbSBhcmJpdHJhcnkgY29uc3RhbnRzLlxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZnJpY3Rpb24gPSBNYXRoLnNxcnQobWF0ZXJpYWxzW2Rpc2MubV0uZnJpY3Rpb24gKiBtYXRlcmlhbHNbZGVjay5tXS5mcmljdGlvbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmZiA9IGYgKiBmcmljdGlvbiAqICh2dCA8PSAwLjAgPyAxLjAgOiAtMS4wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY29uc3QgZGFtcCA9IDI7ICAgLy8gVE9ETzogZmlndXJlIG91dCBob3cgdG8gZGVyaXZlIGEgcmVhc29uYWJsZSBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGRpc2MucCwgdHggKiBmZiwgdHkgKiBmZik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBkZWNrLnAxLCAtdHggKiBmZiAqICgxIC0gdCksIC10eSAqIGZmICogKDEgLSB0KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBkZWNrLnAyLCAtdHggKiBmZiAqIHQsIC10eSAqIGZmICogdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1ldGhvZCA9IG5ldyBSdW5nZUt1dHRhNCh5MCwgdGhpcy5keWR0KTtcbiAgICAgICAgdGhpcy5rZXlmcmFtZXMuc2V0KHRoaXMubWV0aG9kLnQsIG5ldyBGbG9hdDMyQXJyYXkodGhpcy5tZXRob2QueSkpO1xuICAgIH1cblxuICAgIHNlZWtUaW1lcygpOiBJdGVyYWJsZUl0ZXJhdG9yPG51bWJlcj4ge1xuICAgICAgICByZXR1cm4gdGhpcy5rZXlmcmFtZXMua2V5cygpO1xuICAgIH1cblxuICAgIHNlZWsodDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeSA9IHRoaXMua2V5ZnJhbWVzLmdldCh0KTtcbiAgICAgICAgaWYgKHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3R9IGlzIG5vdCBhIGtleWZyYW1lIHRpbWVgKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMubWV0aG9kLnlbaV0gPSB5W2ldO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWV0aG9kLnQgPSB0O1xuXG4gICAgICAgIGlmICh0aGlzLnBsYXlUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnBhdXNlKGVjKTtcbiAgICAgICAgICAgIHRoaXMucGxheShlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aW1lKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm1ldGhvZC50O1xuICAgIH1cblxuICAgIHByaXZhdGUgbmV4dCgpIHsgICAgLy8gVE9ETzogbWFrZSB0aGlzIHByaXZhdGU/XG4gICAgICAgIGNvbnN0IHByZXZUID0gdGhpcy5tZXRob2QudDtcbiAgICAgICAgdGhpcy5tZXRob2QubmV4dCh0aGlzLmgpO1xuICAgICAgICBjb25zdCBpc0tleWZyYW1lID0gTWF0aC5mbG9vcihwcmV2VCAvIHRoaXMua2V5SW50ZXJ2YWwpICE9PSBNYXRoLmZsb29yKHRoaXMubWV0aG9kLnQgLyB0aGlzLmtleUludGVydmFsKTtcbiAgICAgICAgaWYgKHRoaXMudExhdGVzdCA8IHRoaXMubWV0aG9kLnQpIHtcbiAgICAgICAgICAgIGlmIChpc0tleWZyYW1lKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5rZXlmcmFtZXMuc2V0KHRoaXMubWV0aG9kLnQsIG5ldyBGbG9hdDMyQXJyYXkodGhpcy5tZXRob2QueSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50TGF0ZXN0ID0gdGhpcy5tZXRob2QudDtcbiAgICAgICAgfSBlbHNlIGlmIChpc0tleWZyYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB5ID0gdGhpcy5rZXlmcmFtZXMuZ2V0KHRoaXMubWV0aG9kLnQpO1xuICAgICAgICAgICAgaWYgKHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBmcmFtZSAke3RoaXMubWV0aG9kLnR9IHNob3VsZCBiZSBhIGtleWZyYW1lYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IGRpZmYgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgeS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmICh5W2ldICE9PSB0aGlzLm1ldGhvZC55W2ldKSB7XG4gICAgICAgICAgICAgICAgICAgIGRpZmYgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkaWZmKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFJlcGxheWluZyBmcmFtZSAke3RoaXMubWV0aG9kLnR9IHByb2R1Y2VkIGEgZGlmZmVyZW5jZSFgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFJlcGxheWluZyBmcmFtZSAke3RoaXMubWV0aG9kLnR9IHByb2R1Y2VkIHRoZSBzYW1lIHN0YXRlYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwbGF5aW5nKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5wbGF5VGltZXIgIT09IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBwbGF5KGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBpZiAodGhpcy5wbGF5VGltZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucGxheVRpbWUgPSB0aGlzLm1ldGhvZC50O1xuICAgICAgICB0aGlzLnBsYXlUaW1lciA9IGVjLnRpbWVyKHRoaXMucGxheVRpY2ssIHVuZGVmaW5lZCk7XG4gICAgfVxuXG4gICAgcGF1c2UoZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGlmICh0aGlzLnBsYXlUaW1lciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZWMuY2xlYXJUaW1lcih0aGlzLnBsYXlUaW1lcik7XG4gICAgICAgIHRoaXMucGxheVRpbWVyID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGdldFBpbihwaW46IG51bWJlcik6IFBvaW50MkQge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgY29uc3QgaSA9IHRoaXMuZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDI7XG4gICAgICAgICAgICByZXR1cm4gW3RoaXMuZml4ZWRQaW5zW2ldLCB0aGlzLmZpeGVkUGluc1tpKzFdXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSBwaW4gKiAyO1xuICAgICAgICAgICAgY29uc3QgeSA9IHRoaXMubWV0aG9kLnk7XG4gICAgICAgICAgICByZXR1cm4gW3lbaV0sIHlbaSsxXV07XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG50eXBlIE9uQWRkUGluSGFuZGxlciA9IChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25SZW1vdmVQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG5leHBvcnQgY2xhc3MgU2NlbmVFZGl0b3Ige1xuICAgIHNjZW5lOiBTY2VuZUpTT047XG4gICAgcHJpdmF0ZSBzaW06IFNjZW5lU2ltdWxhdG9yIHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgb25BZGRQaW5IYW5kbGVyczogQXJyYXk8T25BZGRQaW5IYW5kbGVyPjtcbiAgICBwcml2YXRlIG9uUmVtb3ZlUGluSGFuZGxlcnM6IEFycmF5PE9uUmVtb3ZlUGluSGFuZGxlcj47XG4gICAgZWRpdE1hdGVyaWFsOiBudW1iZXI7XG4gICAgZWRpdFdpZHRoOiBudW1iZXI7XG4gICAgZWRpdERlY2s6IGJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogU2NlbmVKU09OKSB7XG4gICAgICAgIHRoaXMuc2NlbmUgPSBzY2VuZTtcbiAgICAgICAgdGhpcy5zaW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycyA9IFtdO1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgLy8gVE9ETzogcHJvcGVyIGluaXRpYWxpemF0aW9uO1xuICAgICAgICB0aGlzLmVkaXRNYXRlcmlhbCA9IDA7XG4gICAgICAgIHRoaXMuZWRpdFdpZHRoID0gMTtcbiAgICAgICAgdGhpcy5lZGl0RGVjayA9IHRydWU7XG4gICAgfVxuXG4gICAgc2ltdWxhdG9yKCk6IFNjZW5lU2ltdWxhdG9yIHtcbiAgICAgICAgaWYgKHRoaXMuc2ltID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltID0gbmV3IFNjZW5lU2ltdWxhdG9yKHRoaXMuc2NlbmUsIDAuMDAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5zaW07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FkZEJlYW0oYTogQWRkQmVhbUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgcDEgPSBhLnAxO1xuICAgICAgICBjb25zdCBwMiA9IGEucDI7XG4gICAgICAgIGNvbnN0IG0gPSBhLm07XG4gICAgICAgIGNvbnN0IHcgPSBhLnc7XG4gICAgICAgIGNvbnN0IGwgPSBhLmw7XG4gICAgICAgIGNvbnN0IGRlY2sgPSBhLmRlY2s7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMSk7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIHRydXNzQXNzZXJ0TWF0ZXJpYWwodHJ1c3MsIG0pO1xuICAgICAgICBpZiAodyA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSB3aWR0aCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLCBnb3QgJHt3fWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsICE9PSB1bmRlZmluZWQgJiYgbCA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBsZW5ndGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7bH1gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRydXNzLmVkaXRCZWFtcy5wdXNoKHtwMSwgcDIsIG0sIHcsIGwsIGRlY2t9KTtcbiAgICAgICAgXG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7ICAgLy8gVE9ETzogaGF2ZSBsaXN0ZW5lcnMsIGFuZCB0aGVuIHRoZSBVSSBjb21wb25lbnQgY2FuIGRvIHRoZSByZXF1ZXN0RHJhdygpXG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgdW5kb0FkZEJlYW0oYTogQWRkQmVhbUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgYiA9IHRydXNzLmVkaXRCZWFtcy5wb3AoKTtcbiAgICAgICAgaWYgKGIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBiZWFtcyBleGlzdCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChiLnAxICE9PSBhLnAxIHx8IGIucDIgIT09IGEucDIgfHwgYi5tICE9PSBhLm0gfHwgYi53ICE9IGEudyB8fCBiLmwgIT09IGEubCB8fCBiLmRlY2sgIT09IGEuZGVjaykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCZWFtIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgICAgIH1cbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTsgICAvLyBUT0RPOiBoYXZlIGxpc3RlbmVycywgYW5kIHRoZW4gdGhlIFVJIGNvbXBvbmVudCBjYW4gZG8gdGhlIHJlcXVlc3REcmF3KClcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWRkUGluKGE6IEFkZFBpbkFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgZWRpdEluZGV4ID0gdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICBjb25zdCBwaW4gPSB0cnVzcy50cmFpblBpbnMubGVuZ3RoICsgZWRpdEluZGV4O1xuICAgICAgICB0cnVzcy5lZGl0UGlucy5wdXNoKGEucGluKTtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25BZGRQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQWRkUGluKGE6IEFkZFBpbkFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgcCA9IHRydXNzLmVkaXRQaW5zLnBvcCgpO1xuICAgICAgICBpZiAocCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHBpbnMgZXhpc3QnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocFswXSAhPT0gYS5waW5bMF0gfHwgcFsxXSAhPT0gYS5waW5bMV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUGluIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZWRpdEluZGV4ID0gdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICBjb25zdCBwaW4gPSB0cnVzcy50cmFpblBpbnMubGVuZ3RoICsgZWRpdEluZGV4O1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICBoKGVkaXRJbmRleCwgcGluLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQ29tcG9zaXRlKGE6IENvbXBvc2l0ZUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5hY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmRvQWN0aW9uKGEuYWN0aW9uc1tpXSwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQ29tcG9zaXRlKGE6IENvbXBvc2l0ZUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGZvciAobGV0IGkgPSBhLmFjdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHRoaXMudW5kb0FjdGlvbihhLmFjdGlvbnNbaV0sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9BY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBzd2l0Y2ggKGEudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZF9iZWFtXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0FkZEJlYW0oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFkZF9waW5cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQWRkUGluKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJjb21wb3NpdGVcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQ29tcG9zaXRlKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0FjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHN3aXRjaCAoYS50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX2JlYW1cIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9BZGRCZWFtKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfcGluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQWRkUGluKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJjb21wb3NpdGVcIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9Db21wb3NpdGUoYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgZW51bWVyYXRpb24vb2JzZXJ2YXRpb24gbWV0aG9kc1xuXG4gICAgb25BZGRQaW4oaGFuZGxlcjogT25BZGRQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIG9uUmVtb3ZlUGluKGhhbmRsZXI6IE9uUmVtb3ZlUGluSGFuZGxlcikge1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMucHVzaChoYW5kbGVyKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBDbGVhciBoYW5kbGVycz9cblxuICAgIHVuZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS51bmRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIHJlZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS5yZWRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIC8vIFNjZW5lIG11dGF0aW9uIG1ldGhvZHNcblxuICAgIHVuZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnVuZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHVuZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51bmRvQWN0aW9uKGEsIGVjKTtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sucHVzaChhKTtcbiAgICAgICAgLy8gVE9ETzogdXBkYXRlIHNpbXVsYXRvciB3aXRoIHNhdmVkIHN0YXRlLlxuICAgICAgICBpZiAodGhpcy5zaW0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5zaW0ucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5zaW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZWRvKGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhID0gdGhpcy5zY2VuZS5yZWRvU3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGlvbiB0byByZWRvXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnVuZG9TdGFjay5wdXNoKGEpO1xuICAgICAgICAvLyBUT0RPOiB1cGRhdGUgc2ltdWxhdG9yIHdpdGggc2F2ZWQgc3RhdGUuXG4gICAgICAgIGlmICh0aGlzLnNpbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNpbS5wYXVzZShlYyk7XG4gICAgICAgICAgICB0aGlzLnNpbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sgPSBbYV07XG4gICAgICAgIHRoaXMucmVkbyhlYyk7ICAgIC8vIFRPRE86IElzIHRoaXMgdG9vIGNsZXZlcj9cbiAgICB9XG5cbiAgICBhZGRCZWFtKFxuICAgICAgICBwMTogbnVtYmVyLFxuICAgICAgICBwMjogbnVtYmVyLFxuICAgICAgICBlYzogRWxlbWVudENvbnRleHQsXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgaWYgKHRydXNzQmVhbUV4aXN0cyh0cnVzcywgcDEsIHAyKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gcGlucyAke3AxfSBhbmQgJHtwMn0gYWxyZWFkeSBleGlzdHNgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFjdGlvbih7XG4gICAgICAgICAgICB0eXBlOiBcImFkZF9iZWFtXCIsXG4gICAgICAgICAgICBwMSxcbiAgICAgICAgICAgIHAyLFxuICAgICAgICAgICAgbTogdGhpcy5lZGl0TWF0ZXJpYWwsXG4gICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgIGw6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGRlY2s6IHRoaXMuZWRpdERlY2tcbiAgICAgICAgfSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbihwaW46IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFjdGlvbih7dHlwZTogXCJhZGRfcGluXCIsIHBpbn0sIGVjKTtcbiAgICB9XG5cbiAgICBhZGRQaW5BbmRCZWFtKFxuICAgICAgICBwaW46IFBvaW50MkQsXG4gICAgICAgIHAyOiBudW1iZXIsXG4gICAgICAgIGVjOiBFbGVtZW50Q29udGV4dCxcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICBjb25zdCBwMSA9IHRydXNzLnRyYWluUGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImNvbXBvc2l0ZVwiLCBhY3Rpb25zOiBbXG4gICAgICAgICAgICB7IHR5cGU6IFwiYWRkX3BpblwiLCBwaW59LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgICAgICBwMSxcbiAgICAgICAgICAgICAgICBwMixcbiAgICAgICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgICAgICBsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICAgICAgfSxcbiAgICAgICAgXX0sIGVjKTtcbiAgICB9XG59O1xuXG4vKlxuZXhwb3J0IGZ1bmN0aW9uIHNjZW5lTWV0aG9kKHNjZW5lOiBTY2VuZSk6IE9ERU1ldGhvZCB7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBcbiAgICBjb25zdCBmaXhlZFBpbnMgPSB0cnVzcy5maXhlZFBpbnM7XG4gICAgY29uc3QgbW9iaWxlUGlucyA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgLy8gU3RhdGUgYWNjZXNzb3JzXG4gICAgZnVuY3Rpb24gZ2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW5dWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluXVsxXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAxXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXTsgXG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W3BpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkdngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdICs9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFNwbGl0IGJlYW0gbWFzcyBldmVubHkgYmV0d2VlbiBwaW5zLCBpbml0aWFsaXNlIGJlYW0gbGVuZ3RoLlxuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBjb25zdCBtYXNzID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zKTtcbiAgICBmdW5jdGlvbiBnZXRtKHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXNzW3Bpbl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gNS45NzJlMjQ7ICAgIC8vIE1hc3Mgb2YgdGhlIEVhcnRoLlxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmVhbXMgPSBbLi4udHJ1c3Muc3RhcnRCZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXS5tYXAoKGJlYW06IEJlYW0pOiBTaW11bGF0aW9uQmVhbSA9PiB7XG4gICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICBjb25zdCBsID0gcG9pbnREaXN0YW5jZShzY2VuZS5nZXRQaW4ocDEpLCBzY2VuZS5nZXRQaW4ocDIpKTtcbiAgICAgICAgY29uc3QgbSA9IGwgKiBiZWFtLncgKiBtYXRlcmlhbHNbYmVhbS5tXS5kZW5zaXR5O1xuICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AxXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIG1hc3NbcDJdICs9IG0gKiAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcDEsIHAyLCBtOiBiZWFtLm0sIHc6IGJlYW0udywgbDogYmVhbS5sIHx8IGwsIGRlY2s6IGJlYW0uZGVjayB8fCBmYWxzZSB9O1xuICAgIH0pO1xuXG4gICAgLy8gRGlzYyBtYXNzLlxuICAgIGNvbnN0IGRpc2NzID0gc2NlbmUudHJ1c3MuZGlzY3M7XG4gICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgIGlmIChkaXNjLnAgPj0gbW9iaWxlUGlucykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlzYyBhdHRhY2hlZCB0byBub24gbW9iaWxlIHBpblwiKTtcbiAgICAgICAgfVxuICAgICAgICBtYXNzW2Rpc2MucF0gKz0gZGlzYy5yICogZGlzYy5yICogTWF0aC5QSSAqIG1hdGVyaWFsc1tkaXNjLm1dLmRlbnNpdHk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgdGhhdCBldmVyeXRoaW5nIHRoYXQgY2FuIG1vdmUgaGFzIHNvbWUgbWFzcy5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICBpZiAobWFzc1tpXSA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9iaWxlIHBpbiAke2l9IGhhcyBtYXNzICR7bWFzc1tpXX0gPD0gMC4wYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwaXRjaCA9IHNjZW5lLndpZHRoIC8gKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKTtcbiAgICBjb25zdCBobWFwOiBTaW11bGF0aW9uSE1hcCA9IHNjZW5lLnRlcnJhaW4uaG1hcC5tYXAoKGgsIGkpID0+IHtcbiAgICAgICAgaWYgKGkgKyAxID49IHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgIG54OiAwLjAsXG4gICAgICAgICAgICAgICAgbnk6IDEuMCxcbiAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSBoO1xuICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgIG54OiAtZHkgLyBsLFxuICAgICAgICAgICAgbnk6IHBpdGNoIC8gbCxcbiAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBmdW5jdGlvbiByZXNldERlY2tzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgaG1hcCkge1xuICAgICAgICAgICAgaC5kZWNrQ291bnQgPSAwO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZERlY2soaTogbnVtYmVyLCBkOiBTaW11bGF0aW9uQmVhbSkge1xuICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGggPSBobWFwW2ldO1xuICAgICAgICBoLmRlY2tzW2guZGVja0NvdW50XSA9IGQ7XG4gICAgICAgIGguZGVja0NvdW50Kys7XG4gICAgfVxuICAgIGNvbnN0IHRGcmljdGlvbiA9IHNjZW5lLnRlcnJhaW4uZnJpY3Rpb247XG5cbiAgICAvLyBTZXQgdXAgaW5pdGlhbCBPREUgc3RhdGUgdmVjdG9yLlxuICAgIGNvbnN0IHkwID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zICogNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IGdldFBpbih0cnVzcywgaSk7XG4gICAgICAgIHNldGR4KHkwLCBpLCBkWzBdKTtcbiAgICAgICAgc2V0ZHkoeTAsIGksIGRbMV0pO1xuICAgIH1cbiAgICAvLyBOQjogSW5pdGlhbCB2ZWxvY2l0aWVzIGFyZSBhbGwgMCwgbm8gbmVlZCB0byBpbml0aWFsaXplLlxuXG4gICAgY29uc3QgZyA9ICBzY2VuZS5nO1xuICAgIHJldHVybiBuZXcgUnVuZ2VLdXR0YTQoeTAsIGZ1bmN0aW9uIChfdDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIGR5ZHQ6IEZsb2F0MzJBcnJheSkge1xuICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgc2V0ZHgoZHlkdCwgaSwgZ2V0dngoeSwgaSkpO1xuICAgICAgICAgICAgc2V0ZHkoZHlkdCwgaSwgZ2V0dnkoeSwgaSkpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldHZ4KGR5ZHQsIGksIGdbMF0pO1xuICAgICAgICAgICAgc2V0dnkoZHlkdCwgaSwgZ1sxXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZWNrcyBhcmUgdXBkYXRlZCBpbiBobWFwIGluIHRoZSBiZWxvdyBsb29wIHRocm91Z2ggYmVhbXMsIHNvIGNsZWFyIHRoZSBwcmV2aW91cyB2YWx1ZXMuXG4gICAgICAgIHJlc2V0RGVja3MoKTtcblxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGJlYW0gc3RyZXNzLlxuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IEUgPSBtYXRlcmlhbHNbYmVhbS5tXS5FO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgY29uc3QgdyA9IGJlYW0udztcbiAgICAgICAgICAgIGNvbnN0IGwwID0gYmVhbS5sO1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBwMikgLSBnZXRkeCh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIHAyKSAtIGdldGR5KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJhaW4gPSAobCAtIGwwKSAvIGwwO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJlc3MgPSBzdHJhaW4gKiBFICogdztcbiAgICAgICAgICAgIGNvbnN0IGsgPSBFICogdyAvIGwwO1xuICAgICAgICAgICAgY29uc3Qgc3ByaW5nRiA9IChsIC0gbDApICogaztcbiAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShwMSk7ICAgIC8vIFBpbiBtYXNzXG4gICAgICAgICAgICBjb25zdCBtMiA9IGdldG0ocDIpO1xuICAgICAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgICAgICBjb25zdCB1eSA9IGR5IC8gbDtcblxuICAgICAgICAgICAgLy8gQmVhbSBzdHJlc3MgZm9yY2UuXG4gICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBzcHJpbmdGIC8gbTEpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogc3ByaW5nRiAvIG0xKTtcbiAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBzcHJpbmdGIC8gbTIpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIHNwcmluZ0YgLyBtMik7XG5cbiAgICAgICAgICAgIC8vIERhbXBpbmcgZm9yY2UuXG4gICAgICAgICAgICBjb25zdCB6ZXRhID0gMC41O1xuICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBwMikgLSBnZXR2eCh5LCBwMSk7IC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxLlxuICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBwMikgLSBnZXR2eSh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCB2ID0gdnggKiB1eCArIHZ5ICogdXk7ICAgIC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxIGluIGRpcmVjdGlvbiBvZiBiZWFtLlxuICAgICAgICAgICAgLy8gVE9ETzogbm93IHRoYXQgZ2V0bSByZXR1cm5zIG1hc3Mgb2YgRWFydGggZm9yIGZpeGVkIHBpbnMsIHdlIGRvbid0IG5lZWQgdGhlc2UgZGlmZmVyZW50IGlmIGNsYXVzZXMuXG4gICAgICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zICYmIHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xICogbTIgLyAobTEgKyBtMikpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBkZWNrcyB0byBhY2NsZXJhdGlvbiBzdHJ1Y3R1cmVcbiAgICAgICAgICAgIGlmIChiZWFtLmRlY2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDEpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMikgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1pbihpMSwgaTIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWF4KGkxLCBpMik7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZERlY2soaSwgYmVhbSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gdGVycmFpbiBjb2xsaXNpb24sIHNjZW5lIGJvcmRlciBjb2xsaXNpb25cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgaSk7IC8vIFBpbiBwb3NpdGlvbi5cbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgaSk7XG4gICAgICAgICAgICBsZXQgYXQgPSAxMDAwLjA7IC8vIEFjY2VsZXJhdGlvbiBwZXIgbWV0cmUgb2YgZGVwdGggdW5kZXIgdGVycmFpbi5cbiAgICAgICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbC5cbiAgICAgICAgICAgIGxldCBueTtcbiAgICAgICAgICAgIGlmIChkeCA8IDAuMCkge1xuICAgICAgICAgICAgICAgIG54ID0gMC4wO1xuICAgICAgICAgICAgICAgIG55ID0gMS4wO1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSAwLjApICsgbnkgKiAoZHkgLSBobWFwWzBdLmhlaWdodCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aSA9IE1hdGgubWluKGhtYXAubGVuZ3RoIC0gMSwgTWF0aC5mbG9vcihkeCAvIHBpdGNoKSk7XG4gICAgICAgICAgICAgICAgbnggPSBobWFwW3RpXS5ueDtcbiAgICAgICAgICAgICAgICBueSA9IGhtYXBbdGldLm55O1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uaGVpZ2h0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXQgPiAwLjApIHtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBpLCBueCAqIGF0KTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBpLCBueSAqIGF0KTtcbiAgICAgICAgICAgICAgICAvLyBGcmljdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gaW4gcHJvcG9ydGlvbiB0byBhdCwgaW4gZGlyZWN0aW9uIG9wcG9zaXRlIG9mIHRhbmdlbnQgcHJvamVjdGVkIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgIC8vIENhcCBhY2NlbGVyYXRpb24gYnkgc29tZSBmcmFjdGlvbiBvZiB2ZWxvY2l0eVxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHRha2UgZnJpY3Rpb24gZnJvbSBiZWFtcyB0b28gKGp1c3QgYXZlcmFnZSBiZWFtcyBnb2luZyBpbnRvIHBpbj8pXG4gICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICBjb25zdCB0diA9IGdldHZ4KHksIGkpICogdHggKyBnZXR2eSh5LCBpKSAqIHR5O1xuICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4odEZyaWN0aW9uICogYXQsIE1hdGguYWJzKHR2ICogMTAwKSkgKiAodHYgPj0gMC4wID8gLTEuMCA6IDEuMCk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgaSwgdHggKiBhZik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgaSwgdHkgKiBhZik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBkaXNjLWRlY2sgY29sbGlzaW9uLlxuICAgICAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBkaXNjLnI7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGRpc2MucCk7XG4gICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGhtYXAgYnVja2V0cyB0aGF0IGRpc2Mgb3ZlcmxhcHMuXG4gICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoKGR4IC0gcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoKGR4ICsgcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaTE7IGkgPD0gaTI7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGRlY2tzIGluIHRob3NlIGJ1Y2tldHMuXG4gICAgICAgICAgICAgICAgY29uc3QgZGVja3MgPSBobWFwW2ldLmRlY2tzO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tDb3VudCA9IGhtYXBbaV0uZGVja0NvdW50O1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZGVja0NvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVjayA9IGRlY2tzW2pdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgxID0gZ2V0ZHgoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkxID0gZ2V0ZHkoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgyID0gZ2V0ZHgoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkyID0gZ2V0ZHkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBJcyBjb2xsaXNpb24gaGFwcGVuaW5nP1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzeCA9IHgyIC0geDE7IC8vIFZlY3RvciB0byBlbmQgb2YgZGVjayAoZnJvbSBzdGFydClcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3kgPSB5MiAtIHkxO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeCA9IGR4IC0geDE7IC8vIFZlY3RvciB0byBjZW50cmUgb2YgZGlzYyAoZnJvbSBzdGFydCBvZiBkZWNrKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeSA9IGR5IC0geTE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBzeCAqIHN4ICsgc3kgKiBzeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYiA9IC0yLjAgKiAoY3ggKiBzeCArIGN5ICogc3kpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjID0gY3ggKiBjeCArIGN5ICogY3kgLSByICogcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgRCA9IGIgKiBiIC0gNC4wICogYSAqIGM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChEIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gTm8gUmVhbCBzb2x1dGlvbnMgdG8gaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3REID0gTWF0aC5zcXJ0KEQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gLWIgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0MSA9ICgtYiAtIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHQyID0gKC1iICsgcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHQxIDw9IDAuMCAmJiB0MiA8PSAwLjApIHx8ICh0MSA+PSAxLjAgJiYgdDIgPj0gMC4wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gSW50ZXJzZWN0aW9ucyBhcmUgYm90aCBiZWZvcmUgb3IgYWZ0ZXIgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0MSA9IE1hdGgubWF4KHQxLCAwLjApO1xuICAgICAgICAgICAgICAgICAgICB0MiA9IE1hdGgubWluKHQyLCAxLjApO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgY29sbGlzaW9uIGFjY2VsZXJhdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGlzIHByb3BvcnRpb25hbCB0byBhcmVhICdzaGFkb3dlZCcgaW4gdGhlIGRpc2MgYnkgdGhlIGludGVyc2VjdGluZyBkZWNrLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIHNvIHRoYXQgYXMgYSBkaXNjIG1vdmVzIGJldHdlZW4gdHdvIGRlY2sgc2VnbWVudHMsIHRoZSBhY2NlbGVyYXRpb24gcmVtYWlucyBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF4ID0gKDEgLSB0MSkgKiB4MSArIHQxICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQxIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF5ID0gKDEgLSB0MSkgKiB5MSArIHQxICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ4ID0gKDEgLSB0MikgKiB4MSArIHQyICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQyIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ5ID0gKDEgLSB0MikgKiB5MSArIHQyICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGEgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHQxeSwgdDF4KSAtIE1hdGguYXRhbjIodDJ5LCB0MngpKSAlIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZWEgPSAwLjUgKiByICogciAqIHRhIC0gMC41ICogTWF0aC5hYnModDF4ICogdDJ5IC0gdDF5ICogdDJ4KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW4gPSAxMDAwLjAgKiBhcmVhOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgd2hhdCBhY2NlbGVyYXRpb24gdG8gdXNlXG4gICAgICAgICAgICAgICAgICAgIGxldCBueCA9IGN4IC0gc3ggKiB0O1xuICAgICAgICAgICAgICAgICAgICBsZXQgbnkgPSBjeSAtIHN5ICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChueCAqIG54ICsgbnkgKiBueSk7XG4gICAgICAgICAgICAgICAgICAgIG54IC89IGw7XG4gICAgICAgICAgICAgICAgICAgIG55IC89IGw7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9ucyB0byB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWQgPSBnZXRtKGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShkZWNrLnAxKSAqICgxLjAgLSB0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTIgPSBnZXRtKGRlY2sucDIpICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWQgPSAobTEgKyBtMikgLyAobWQgKyBtMSArIG0yKTsgIC8vIFNoYXJlIG9mIGFjY2VsZXJhdGlvbiBmb3IgZGlzYywgZGVjayBlbmRwb2ludHMuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGExID0gKG1kICsgbTIpIC8gKG1kICsgbTEgKyBtMikgKiAoMS4wIC0gdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEyID0gKG1kICsgbTEpIC8gKG1kICsgbTEgKyBtMikgKiB0O1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkaXNjLnAsIG54ICogYW4gKiBhZCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgbnkgKiBhbiAqIGFkKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAxLCAtbnggKiBhbiAqIGExKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMSwgLW55ICogYW4gKiBhMSk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC1ueCAqIGFuICogYTIpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAyLCAtbnkgKiBhbiAqIGEyKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGZyaWN0aW9uIGFuZCBkYW1waW5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgcmVsYXRpdmUgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgZGlzYy5wKSAtICgxLjAgLSB0KSAqIGdldHZ4KHksIGRlY2sucDEpIC0gdCAqIGdldHZ4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eSh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgdm4gPSB2eCAqIG54ICsgdnkgKiBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ0ID0gdnggKiB0eCArIHZ5ICogdHkgLSBkaXNjLnY7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRvdGFsbHkgdW5zY2llbnRpZmljIHdheSB0byBjb21wdXRlIGZyaWN0aW9uIGZyb20gYXJiaXRyYXJ5IGNvbnN0YW50cy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnJpY3Rpb24gPSBNYXRoLnNxcnQobWF0ZXJpYWxzW2Rpc2MubV0uZnJpY3Rpb24gKiBtYXRlcmlhbHNbZGVjay5tXS5mcmljdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4oYW4gKiBmcmljdGlvbiwgTWF0aC5hYnModnQgKiAxMDApKSAqICh2dCA8PSAwLjAgPyAxLjAgOiAtMS4wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcCA9IDI7ICAgLy8gVE9ETzogZmlndXJlIG91dCBob3cgdG8gZGVyaXZlIGEgcmVhc29uYWJsZSBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGlzYy5wLCB0eCAqIGFmICogYWQgLSB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgdHkgKiBhZiAqIGFkIC0gdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDEsIC10eCAqIGFmICogYTEgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDEsIC10eSAqIGFmICogYTEgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC10eCAqIGFmICogYTIgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDIsIC10eSAqIGFmICogYTIgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzY2VuZVJlbmRlcmVyKHNjZW5lOiBTY2VuZSk6IFRydXNzUmVuZGVyIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBcbiAgICAvLyBQcmUtcmVuZGVyIHRlcnJhaW4uXG4gICAgY29uc3QgdGVycmFpbiA9IHNjZW5lLnRlcnJhaW47XG4gICAgY29uc3QgaG1hcCA9IHRlcnJhaW4uaG1hcDtcbiAgICBjb25zdCB0ZXJyYWluUGF0aCA9IG5ldyBQYXRoMkQoKTtcbiAgICB0ZXJyYWluUGF0aC5tb3ZlVG8oMC4wLCAwLjApO1xuICAgIGxldCB4ID0gMC4wO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG1hcC5sZW5ndGg7IGkrKykge1xuICAgICAgICB0ZXJyYWluUGF0aC5saW5lVG8oeCwgaG1hcFtpXSk7XG4gICAgICAgIHggKz0gdGVycmFpbi5waXRjaDtcbiAgICB9XG4gICAgdGVycmFpblBhdGgubGluZVRvKHggLSB0ZXJyYWluLnBpdGNoLCAwLjApO1xuICAgIHRlcnJhaW5QYXRoLmNsb3NlUGF0aCgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBvZGU6IE9ERU1ldGhvZCkge1xuICAgICAgICAvLyBUZXJyYWluLlxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICAgICAgY3R4LmZpbGwodGVycmFpblBhdGgpO1xuXG4gICAgICAgIGNvbnN0IHkgPSBvZGUueTtcblxuICAgICAgICAvLyBEaXNjc1xuICAgICAgICBjb25zdCBkaXNjcyA9IHRydXNzLmRpc2NzO1xuICAgICAgICBcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmVkXCI7XG4gICAgICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgcCA9IGRpc2MucDtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5hcmMoeVtwICogMiArIDBdLCB5W3AgKiAyICsgMV0sIGRpc2MuciwgMC4wLCAyICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjdHguZmlsbChcIm5vbnplcm9cIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCZWFtcy5cbiAgICAgICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gbWF0ZXJpYWxzW2JlYW0ubV0uc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYmVhbS53O1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuXG4gICAgICAgICAgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byB1c2Ugb2RlIGFjY2Vzc29ycy5cbiAgICAgICAgICAgIC8vIFdhaXQsIGRvZXMgdGhhdCBtZWFuIHdlIG5lZWQgYW4gT0RFIGZvciBhIHN0YXRpYyBzY2VuZT9cbiAgICAgICAgICAgIC8vIFdpbGwgbmVlZCBkaWZmZXJlbnQgbWV0aG9kcy5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHAxIDwgMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSBnZXRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHlbcDEgKiAyICsgMF0sIHlbcDEgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AxXTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHlbcDIgKiAyICsgMF0sIHlbcDIgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AyXTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiovXG5cbnR5cGUgQ3JlYXRlQmVhbVBpblN0YXRlID0ge1xuICAgIGVkaXQ6IFNjZW5lRWRpdG9yLFxuICAgIGk6IG51bWJlcixcbiAgICBkcmFnPzogeyBwOiBQb2ludDJELCBpPzogbnVtYmVyIH0sXG59O1xuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDAuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcImJsYWNrXCI7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIFxuICAgIGlmIChzdGF0ZS5kcmFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBwMSA9IHRydXNzR2V0UGluKHRydXNzLCBzdGF0ZS5pKTtcbiAgICBjb25zdCBwMiA9IHN0YXRlLmRyYWcuaSA9PT0gdW5kZWZpbmVkID8gc3RhdGUuZHJhZy5wIDogdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmRyYWcuaSk7XG4gICAgY29uc3QgdyA9IHN0YXRlLmVkaXQuZWRpdFdpZHRoO1xuICAgIGNvbnN0IHN0eWxlID0gdHJ1c3MubWF0ZXJpYWxzW3N0YXRlLmVkaXQuZWRpdE1hdGVyaWFsXS5zdHlsZTtcbiAgICBjb25zdCBkZWNrID0gc3RhdGUuZWRpdC5lZGl0RGVjaztcbiAgICBkcmF3QmVhbShjdHgsIHAxLCBwMiwgdywgc3R5bGUsIGRlY2spO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25QYW4ocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogQ3JlYXRlQmVhbVBpblN0YXRlKSB7XG4gICAgY29uc3QgdHJ1c3MgPSBzdGF0ZS5lZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IG1heExlbmd0aCA9IHRydXNzLm1hdGVyaWFsc1tzdGF0ZS5lZGl0LmVkaXRNYXRlcmlhbF0ubWF4TGVuZ3RoO1xuICAgIGNvbnN0IHAwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmkpO1xuICAgIGxldCBwID0gcHNbMF0uY3VycjtcbiAgICBjb25zdCBsZW5ndGggPSBwb2ludERpc3RhbmNlKHAwLCBwKTtcbiAgICAvLyBDYXAgYmVhbSBsZW5ndGggYXQgbWF4aW11bSBsZW5ndGg7XG4gICAgaWYgKGxlbmd0aCA+IG1heExlbmd0aCkge1xuICAgICAgICAvLyBCYXJ5Y2VudHJpYyBjb29yZGluYXRlIG9mIG1heGltdW0gbGVuZ3RoIGZvciBtYXRlcmlhbCBvbiBsaW5lIHNlZ21lbnQgcCAtPiBwMC5cbiAgICAgICAgY29uc3QgdCA9IG1heExlbmd0aCAvIGxlbmd0aDtcbiAgICAgICAgcFswXSA9IHBbMF0gKiB0ICsgcDBbMF0gKiAoMSAtIHQpO1xuICAgICAgICBwWzFdID0gcFsxXSAqIHQgKyBwMFsxXSAqICgxIC0gdCk7XG4gICAgfVxuICAgIGNvbnN0IGkgPSB0cnVzc0dldENsb3Nlc3RQaW4odHJ1c3MsIHAsIDIsIHN0YXRlLmksIG1heExlbmd0aCk7XG4gICAgc3RhdGUuZHJhZyA9IHsgcCwgaSB9O1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbkVuZChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkcmFnIHN0YXRlIE9uUGFuRW5kXCIpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RhdGUuZWRpdC5hZGRQaW5BbmRCZWFtKHN0YXRlLmRyYWcucCwgc3RhdGUuaSwgZWMpO1xuICAgIH0gZWxzZSBpZiAoIXRydXNzQmVhbUV4aXN0cyh0cnVzcywgc3RhdGUuZHJhZy5pLCBzdGF0ZS5pKSkge1xuICAgICAgICAvLyBUT0RPOiByZXBsYWNlIGV4aXN0aW5nIGJlYW0gaWYgb25lIGV4aXN0cyAoYW5kIGlzIGVkaXRhYmxlKS5cbiAgICAgICAgc3RhdGUuZWRpdC5hZGRCZWFtKHN0YXRlLmRyYWcuaSwgc3RhdGUuaSwgZWMpO1xuICAgIH1cbiAgICBzdGF0ZS5kcmFnID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBDcmVhdGVCZWFtUGluKGVkaXQ6IFNjZW5lRWRpdG9yLCBpOiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDxhbnksIGFueT4ge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgIC8vIElmIHdlIGhhZCBzdGF0ZSB0aGF0IHdhcyBwYXNzZWQgdG8gYWxsIGhhbmRsZXJzLCB0aGVuIHdlIGNvdWxkIGF2b2lkIGFsbG9jYXRpbmcgbmV3IGhhbmRsZXJzIHBlciBFbGVtZW50LlxuICAgIHJldHVybiBQb3NpdGlvbjxDcmVhdGVCZWFtUGluU3RhdGU+KHBbMF0gLSAyLCBwWzFdIC0gMiwgNCwgNCwgeyBlZGl0LCBpIH0pXG4gICAgICAgIC5vbkRyYXcoY3JlYXRlQmVhbVBpbk9uRHJhdylcbiAgICAgICAgLm9uUGFuKGNyZWF0ZUJlYW1QaW5PblBhbilcbiAgICAgICAgLm9uUGFuRW5kKGNyZWF0ZUJlYW1QaW5PblBhbkVuZCk7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzRWRpdGFibGVQaW5zKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IGNoaWxkcmVuID0gW107XG4gICAgZm9yIChsZXQgaSA9IHRydXNzRWRpdFBpbnNCZWdpbih0cnVzcyk7IGkgIT09IHRydXNzRWRpdFBpbnNFbmQodHJ1c3MpOyBpKyspIHtcbiAgICAgICAgY2hpbGRyZW4ucHVzaChDcmVhdGVCZWFtUGluKGVkaXQsIGkpKTtcbiAgICB9XG4gICAgY29uc3QgZSA9IFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcblxuICAgIGVkaXQub25BZGRQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBhZGRpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIGFkZENoaWxkKGUsIENyZWF0ZUJlYW1QaW4oZWRpdCwgcGluKSwgZWMsIGVkaXRJbmRleCk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcbiAgICBlZGl0Lm9uUmVtb3ZlUGluKChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgcmVtb3ZpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIHJlbW92ZUNoaWxkKGUsIGVkaXRJbmRleCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSk7XG5cbiAgICAvLyBUT0RPOiBlLm9uRGV0YWNoIGZvciByZW1vdmVpbmcgcGluIG9ic2VydmVycy5cbiAgICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NVbmVkaXRhYmxlUGlucyhlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCB3aWR0aCA9IGVkaXQuc2NlbmUud2lkdGg7XG4gICAgY29uc3QgaGVpZ2h0ID0gZWRpdC5zY2VuZS5oZWlnaHQ7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzKTsgaSAhPT0gdHJ1c3NVbmVkaXRhYmxlUGluc0VuZCh0cnVzcyk7IGkrKykge1xuICAgICAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICBpZiAocFswXSA+IDAgJiYgcFswXSA8IHdpZHRoICYmIHBbMV0gPiAwICYmIHBbMV0gPCBoZWlnaHQpIHtcbiAgICAgICAgICAgIC8vIEJlYW1zIHNob3VsZCBvbmx5IGJlIGNyZWF0ZWQgZnJvbSBwaW5zIHN0cmljdGx5IGluc2lkZSB0aGUgc2NlbmUuXG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKENyZWF0ZUJlYW1QaW4oZWRpdCwgaSkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBSZWxhdGl2ZSguLi5jaGlsZHJlbik7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzTGF5ZXIoc2NlbmU6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIExheWVyKFxuICAgICAgICBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKHNjZW5lKSxcbiAgICAgICAgQWRkVHJ1c3NFZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGRyYXdCZWFtKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBwMTogUG9pbnQyRCwgcDI6IFBvaW50MkQsIHc6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgZGVjaz86IGJvb2xlYW4pIHtcbiAgICBjdHgubGluZVdpZHRoID0gdztcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhwMVswXSwgcDFbMV0pO1xuICAgIGN0eC5saW5lVG8ocDJbMF0sIHAyWzFdKTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgaWYgKGRlY2sgIT09IHVuZGVmaW5lZCAmJiBkZWNrKSB7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYnJvd25cIjsgIC8vIFRPRE86IGRlY2sgc3R5bGVcbiAgICAgICAgY3R4LmxpbmVXaWR0aCA9IHcgKiAwLjc1O1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8ocDFbMF0sIHAxWzFdKTtcbiAgICAgICAgY3R4LmxpbmVUbyhwMlswXSwgcDJbMV0pO1xuICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBUcnVzc0xheWVyKHRydXNzOiBUcnVzcyk6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIHJldHVybiBGaWxsKHRydXNzKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCB0cnVzczogVHJ1c3MpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnRyYWluQmVhbXMpIHtcbiAgICAgICAgICAgIGRyYXdCZWFtKGN0eCwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDEpLCB0cnVzc0dldFBpbih0cnVzcywgYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGQgb2YgdHJ1c3MuZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IG0gPSB0cnVzcy5tYXRlcmlhbHNbZC5tXTtcbiAgICAgICAgICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgZC5wKTtcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSBtLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmVsbGlwc2UocFswXSwgcFsxXSwgZC5yLCBkLnIsIDAsIDAsIDIgKiBNYXRoLlBJKTtcbiAgICAgICAgICAgIGN0eC5maWxsKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gU2ltdWxhdGVMYXllcihlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIHJldHVybiBGaWxsKGVkaXQpLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSA9PiB7XG4gICAgICAgIGNvbnN0IHNjZW5lID0gZWRpdC5zY2VuZTtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICAgICAgY29uc3Qgc2ltID0gZWRpdC5zaW11bGF0b3IoKTtcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnRyYWluQmVhbXMpIHtcbiAgICAgICAgICAgIGRyYXdCZWFtKGN0eCwgc2ltLmdldFBpbihiLnAxKSwgc2ltLmdldFBpbihiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICBkcmF3QmVhbShjdHgsIHNpbS5nZXRQaW4oYi5wMSksIHNpbS5nZXRQaW4oYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBkIG9mIHRydXNzLmRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gdHJ1c3MubWF0ZXJpYWxzW2QubV07XG4gICAgICAgICAgICBjb25zdCBwID0gc2ltLmdldFBpbihkLnApO1xuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IG0uc3R5bGU7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHguZWxsaXBzZShwWzBdLCBwWzFdLCBkLnIsIGQuciwgMCwgMCwgMiAqIE1hdGguUEkpO1xuICAgICAgICAgICAgY3R4LmZpbGwoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3VGVycmFpbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gsIHRlcnJhaW46IFRlcnJhaW4pIHtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHBpdGNoID0gYm94LndpZHRoIC8gKGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgbGVmdCA9IHZwLmxlZnQgLSBib3gubGVmdDtcbiAgICBjb25zdCByaWdodCA9IGxlZnQgKyB2cC53aWR0aDtcbiAgICBjb25zdCBiZWdpbiA9IE1hdGgubWF4KE1hdGgubWluKE1hdGguZmxvb3IobGVmdCAvIHBpdGNoKSwgaG1hcC5sZW5ndGggLSAxKSwgMCk7XG4gICAgY29uc3QgZW5kID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5jZWlsKHJpZ2h0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhib3gubGVmdCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgaSAqIHBpdGNoLCBib3gudG9wICsgaG1hcFtpXSk7XG4gICAgfVxuICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGgsIGJveC50b3AgKyBib3guaGVpZ2h0KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0ZpbGwoc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybikge1xuICAgIHJldHVybiAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBzdHlsZTtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGlmIChlZGl0LnVuZG9Db3VudCgpID4gMCkge1xuICAgICAgICBlZGl0LnVuZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGNjdzogYm9vbGVhbikge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuXG4gICAgY29uc3QgYiA9IGNjdyA/IE1hdGguUEkgKiAwLjc1IDogTWF0aC5QSSAqIDAuMjU7XG4gICAgY29uc3QgZSA9IGNjdyA/IE1hdGguUEkgKiAxIDogTWF0aC5QSSAqIDI7XG4gICAgY29uc3QgbCA9IGNjdyA/IC1NYXRoLlBJICogMC4zIDogTWF0aC5QSSAqIDAuMztcbiAgICBjb25zdCBweCA9IHIgKiBNYXRoLmNvcyhlKTtcbiAgICBjb25zdCBweSA9IHIgKiBNYXRoLnNpbihlKVxuICAgIGNvbnN0IHR4ID0gciAqIE1hdGguY29zKGUgLSBsKSAtIHB4O1xuICAgIGNvbnN0IHR5ID0gciAqIE1hdGguc2luKGUgLSBsKSAtIHB5O1xuICAgIGNvbnN0IG54ID0gLXR5IC8gTWF0aC5zcXJ0KDMpO1xuICAgIGNvbnN0IG55ID0gdHggLyBNYXRoLnNxcnQoMyk7XG4gICAgXG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5lbGxpcHNlKHgsIHksIHIsIHIsIDAsIGIsIGUsIGNjdyk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHggKyB0eCArIG54LCB5ICsgcHkgKyB0eSArIG55KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCArIHR4IC0gbngsIHkgKyBweSArIHR5IC0gbnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0J1dHRvbkJvcmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIDEsIGJveC53aWR0aCAtIDIsIGJveC5oZWlnaHQgLSAyKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQudW5kb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eCwgYm94LCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCh1bmRvQnV0dG9uVGFwKS5vbkRyYXcodW5kb0J1dHRvbkRyYXcpO1xufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikgPT4ge1xuICAgICAgICBpZiAoZWRpdC5yZWRvQ291bnQoKSA+IDApIHtcbiAgICAgICAgICAgIGVkaXQucmVkbyhlYyk7XG4gICAgICAgIH1cbiAgICB9KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQucmVkb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBib3gsIGZhbHNlKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZGVja0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgZWRpdC5lZGl0RGVjayA9ICFlZGl0LmVkaXREZWNrO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICAgICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgICAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgW3ggLSByLCB5XSwgW3ggKyAgciwgeV0sIDE2LCBcImJsYWNrXCIsIGVkaXQuZWRpdERlY2spO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3UGxheShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCAtIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHIsIHkpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdQYXVzZShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgcHgsIHkgLSBweSk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gcHgsIHkgLSBweSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBwbGF5QnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDApLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnN0IHNpbSA9IGVkaXQuc2ltdWxhdG9yKCk7XG4gICAgICAgIGlmIChzaW0ucGxheWluZygpKSB7XG4gICAgICAgICAgICBzaW0ucGF1c2UoZWMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltLnBsYXkoZWMpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGlmIChlZGl0LnNpbXVsYXRvcigpLnBsYXlpbmcoKSkge1xuICAgICAgICAgICAgZHJhd1BhdXNlKGN0eCwgYm94KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRyYXdQbGF5KGN0eCwgYm94KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3UmVzZXQoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgY29uc3QgcHggPSBNYXRoLmNvcyhNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjb25zdCBweSA9IE1hdGguc2luKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSAtIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gciwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5IC0gcHkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gcmVzZXRCdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3Qgc2ltID0gZWRpdC5zaW11bGF0b3IoKTtcbiAgICAgICAgaWYgKHNpbS5wbGF5aW5nKCkpIHtcbiAgICAgICAgICAgIHNpbS5wYXVzZShlYyk7XG4gICAgICAgIH1cbiAgICAgICAgc2ltLnNlZWsoMCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdSZXNldChjdHgsIGJveCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHRhYkZpbGxlcigpIHtcbiAgICByZXR1cm4gRmxleCgwLCAxKS50b3VjaFNpbmsoKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJncmF5XCI7XG4gICAgICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFNjZW5lRWxlbWVudChzY2VuZUpTT046IFNjZW5lSlNPTik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IGVkaXQgPSBuZXcgU2NlbmVFZGl0b3Ioc2NlbmVKU09OKTtcblxuICAgIGNvbnN0IHNjZW5lVUkgPSBNdXgoXG4gICAgICAgIFtcInRlcnJhaW5cIiwgXCJ0cnVzc1wiLCBcImFkZF90cnVzc1wiXSxcbiAgICAgICAgW1widGVycmFpblwiLCBGaWxsKHNjZW5lSlNPTi50ZXJyYWluKS5vbkRyYXcoZHJhd1RlcnJhaW4pXSxcbiAgICAgICAgW1widHJ1c3NcIiwgVHJ1c3NMYXllcihzY2VuZUpTT04udHJ1c3MpXSxcbiAgICAgICAgW1wiYWRkX3RydXNzXCIsIEFkZFRydXNzTGF5ZXIoZWRpdCldLFxuICAgICAgICBbXCJzaW11bGF0ZVwiLCBTaW11bGF0ZUxheWVyKGVkaXQpXSxcbiAgICApO1xuXG4gICAgY29uc3QgZHJhd1IgPSBkcmF3RmlsbChcInJlZFwiKTtcbiAgICBjb25zdCBkcmF3RyA9IGRyYXdGaWxsKFwiZ3JlZW5cIik7XG4gICAgY29uc3QgZHJhd0IgPSBkcmF3RmlsbChcImJsdWVcIik7XG5cbiAgICBjb25zdCB0b29scyA9IFN3aXRjaChcbiAgICAgICAgMSxcbiAgICAgICAgTGVmdCh1bmRvQnV0dG9uKGVkaXQpLCByZWRvQnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgICAgIExlZnQoZGVja0J1dHRvbihlZGl0KSwgdGFiRmlsbGVyKCkpLFxuICAgICAgICBMZWZ0KHJlc2V0QnV0dG9uKGVkaXQpLCBwbGF5QnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgKTtcblxuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgU2Nyb2xsKFxuICAgICAgICAgICAgQm94KFxuICAgICAgICAgICAgICAgIHNjZW5lSlNPTi53aWR0aCwgc2NlbmVKU09OLmhlaWdodCxcbiAgICAgICAgICAgICAgICBzY2VuZVVJLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIDE2LFxuICAgICAgICApLFxuICAgICAgICBCb3R0b20oXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIHRvb2xzLCAgXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgRmxleCg2NCwgMCxcbiAgICAgICAgICAgICAgICBMZWZ0KFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd1IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHRvb2xzLnNldCgwLCBlYyk7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiKTsgZWRpdC5zaW11bGF0b3IoKS5wYXVzZShlYykgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Rykub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDEsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCIpOyBlZGl0LnNpbXVsYXRvcigpLnBhdXNlKGVjKTsgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Qikub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvb2xzLnNldCgyLCBlYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwic2ltdWxhdGVcIik7XG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICApLFxuICAgICAgICApLFxuICAgICk7XG5cbiAgICAvLyBUT0RPOiBzaW5nbGUgZ2xvYmFsIGRhbXBpbmcgZm9yY2UgYmFzZWQgb24gc3BlZWQuIEZvcmdldCBkYW1waW5nIGJlYW1zP1xuXG4gICAgLy8gVE9ETzogc2Nyb2xsIHRvIHpvb20sIG1vdXNlIGN1cnNvciBjb3VudHMgYXMgYSB0YXAuICh1c2UgcG9pbnRlciBldmVudHM/KVxuXG4gICAgLy8gVE9ETzogbWF4IGJlYW0gbGVuZ3RoIChmcm9tIG1hdGVyaWFsLiBtYWtlIGl0IGRlcGVuZCBvbiB3aWR0aD8gTWF5YmUganVzdCBoYXZlIGEgYnVja2xpbmcgZm9yY2UgZG9uZSBwcm9wZXJseSBhbmQgaXQgdGFrZXMgY2FyZSBvZiBpdHNlbGYuLi4pXG5cbiAgICAvLyBUT0RPOiBmaXggbWF0ZXJpYWxzXG5cbiAgICAvLyBUT0RPOiBzaW11bGF0aW9uIHN0YXRlIHN0b3JlZCBpbiBkby91bmRvIHN0YWNrcy5cblxuICAgIC8vIFRPRE86IGZpeCB0cmFpbiBzaW11bGF0aW9uIChtYWtlIHN1cmUgdHJhaW4gY2FuIGJyZWFrIGFwYXJ0LCBtYWtlIG9ubHkgZnJvbnQgZGlzayB0dXJuLCBiYWNrIGRpc2tzIGhhdmUgbG93IGZyaWN0aW9uPylcbiAgICAvLyBUT0RPOiBtb2RlIHdoZXJlIGlmIHRoZSB3aG9sZSB0cmFpbiBtYWtlcyBpdCBhY3Jvc3MsIHRoZSB0cmFpbiB0ZWxlcG9ydHMgYmFjayB0byB0aGUgYmVnaW5uaW5nIGFuZCBnZXRzIGhlYXZpZXJcbiAgICAvLyBUT0RPOiBkcmF3IHRyYWluXG5cbiAgICAvLyBUT0RPOiBtYXRlcmlhbCBzZWxlY3Rpb24uIChtaWdodCBuZWVkIHRleHQgbGF5b3V0LCB3aGljaCBpcyBhIHdob2xlIGNhbiBvZiB3b3Jtcy4uLilcblxuICAgIC8vIFRPRE86IHNhdmUvbG9hZFxuICAgIC8vIEhhdmUgbGlzdCBvZiBsZXZlbHMgaW4gc29tZSBKU09OIHJlc291cmNlIGZpbGUuXG4gICAgLy8gSGF2ZSBvcHRpb24gdG8gbG9hZCBqc29uIGZpbGUgZnJvbSBsb2NhbC5cbiAgICAvLyBhdXRvLXNhdmUgZXZlcnkgbiBzZWNvbmRzIGFmdGVyIGNoYW5nZSwga2V5IGluIGxvY2FsIHN0b3JhZ2UgaXMgdXJpIG9mIGxldmVsIGpzb24uXG4gICAgLy8gd2hlbiBsb2FkaW5nLCBjaGVjayBsb2NhbCBzdG9yYWdlIGFuZCBsb2FkIHRoYXQgaW5zdGVhZCBpZiBpdCBleGlzdHMgKGFuZCB0aGUgbm9uIGVkaXRhYmxlIHBhcnRzIG1hdGNoPylcbn1cbiJdfQ==