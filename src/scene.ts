// Copyright Charles Dueck 2020

import { Derivative } from "./ode.js";
import { Point2D, pointDistance } from "./point.js";
import { RungeKutta4 } from "./rk4.js";
import { addChild, Bottom, Box, ElementContext, Fill, Flex, Layer, LayoutBox, LayoutTakesWidthAndHeight, Left, Mux, PanPoint, Position, PositionLayout, Relative, removeChild, Scroll, Switch, TimerHandler } from "./ui/node.js";

export type Beam = {
    p1: number; // Index of pin at beginning of beam.
    p2: number; // Index of pin at end of beam.
    m: number;  // Index of material of beam.
    w: number;  // Width of beam.
    l?: number; // Length of beam, only specified when pre-straining.
    deck?: boolean; // Is this beam a deck? (do discs collide)
};

type SimulationBeam = {
    p1: number;
    p2: number;
    m: number;
    w: number;
    l: number;
    deck: boolean;
}

export type Disc = {
    p: number;  // Index of moveable pin this disc surrounds.
    m: number;  // Material of disc.
    r: number;  // Radius of disc.
    v: number;  // Velocity of surface of disc (in CCW direction).
};

export type Material = {
    E: number;  // Young's modulus in Pa.
    density: number;    // kg/m^3
    style: string | CanvasGradient | CanvasPattern;
    friction: number;
    // TODO: when stuff breaks, work hardening, etc.
};

export type Truss = {
    fixedPins: Array<Point2D>;
    startPins: Array<Point2D>;
    editPins: Array<Point2D>;
    startBeams: Array<Beam>;
    editBeams: Array<Beam>;
    discs: Array<Disc>;
    materials: Array<Material>;
};

function trussAssertMaterial(truss: Truss, m: number) {
    const materials = truss.materials;
    if (m < 0 || m >= materials.length) {
        throw new Error(`Unknown material index ${m}`);
    }
}

function trussAssertPin(truss: Truss, pin: number) {
    if (pin < -truss.fixedPins.length || pin >= truss.startPins.length + truss.editPins.length) {
        throw new Error(`Unknown pin index ${pin}`);
    }
}

function trussBeamExists(truss: Truss, p1: number, p2: number): boolean {
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

function trussEditPinsBegin(truss: Truss): number {
    return truss.startPins.length;
}

function trussEditPinsEnd(truss: Truss): number {
    return truss.startPins.length + truss.editPins.length;
}

function trussUneditablePinsBegin(truss: Truss): number {
    return -truss.fixedPins.length;
}

function trussUneditablePinsEnd(truss: Truss): number {
    return truss.startPins.length;
}

function trussMovingPinsCount(truss: Truss): number {
    return truss.startPins.length + truss.editPins.length;
}

function trussGetClosestPin(truss: Truss, p: Point2D, maxd: number, beamStart?: number): number | undefined {
    // TODO: acceleration structures. Probably only matters once we have 1000s of pins?
    const block = new Set<number>();
    let res = undefined;
    let resd = maxd;
    if (beamStart !== undefined) {
        for (const b of truss.startBeams) {
            if (b.p1 === beamStart) {
                block.add(b.p2);
            } else if (b.p2 === beamStart) {
                block.add(b.p1);
            }
        }
        for (const b of truss.editBeams) {
            if (b.p1 === beamStart) {
                block.add(b.p2);
            } else if (b.p2 === beamStart) {
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

function trussGetPin(truss: Truss, pin: number): Point2D {
    if (pin < -truss.fixedPins.length) {
        throw new Error(`Unkown pin index ${pin}`);
    } else if (pin < 0) {
        return truss.fixedPins[truss.fixedPins.length + pin];
    } else if (pin < truss.startPins.length) {
        return truss.startPins[pin];
    } else if (pin - truss.startPins.length < truss.editPins.length) {
        return truss.editPins[pin - truss.startPins.length];
    } else {
        throw new Error(`Unkown pin index ${pin}`);
    }
}

export type Terrain = {
    hmap: Array<number>;
    friction: number;
    style: string | CanvasGradient | CanvasPattern;
};

type SimulationHMap = Array<{
    height: number;
    nx: number; // Outward (direction of bounce) normal unit vector.
    ny: number;
    decks: Array<SimulationBeam>;   // Updated every frame, all decks above this segment.
    decksLeft: Array<number>;       // Leftmost index in hmap of deck at same index in decks.
    deckCount: number;  // Number of indices in decks being used.
}>;

type AddBeamAction = {
    type: "add_beam";
    p1: number;
    p2: number;
    m: number;
    w: number;
    l?: number;
    deck?: boolean;
};

type AddPinAction = {
    type: "add_pin";
    pin: Point2D;
};

type CompositeAction = {
    type: "composite";
    actions: Array<TrussAction>;
};

type TrussAction = AddBeamAction | AddPinAction | CompositeAction;


export type SceneJSON = {
    truss: Truss;
    terrain: Terrain;
    height: number;
    width: number;
    g: Point2D;  // Acceleration due to gravity.
    redoStack: Array<TrussAction>;
    undoStack: Array<TrussAction>;
}

class SceneSimulator {
    private method: RungeKutta4;                    // ODE solver method used to simulate.
    private dydt: Derivative;                       // Derivative of ODE state.
    private h: number;                              // Time step.
    private fixedPins: Float32Array;                // Positions of fixed pins [x0, y0, x1, y1, ...].
    private tLatest: number;                        // The highest time value simulated.
    private keyInterval: number;                      // Time per keyframe.
    private keyframes: Map<number, Float32Array>;   // Map of time to saved state.
    private playTimer: number | undefined;
    private playTime: number;
    private playTick: TimerHandler;

    constructor(scene: SceneJSON, h: number, keyInterval: number) {
        this.h = h;
        this.tLatest = 0;
        this.keyInterval = keyInterval;
        this.keyframes = new Map();
        this.playTimer = undefined;
        this.playTime = 0;
        this.playTick = (ms: number, ec: ElementContext) => {
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
        const beams: Array<SimulationBeam> = [...truss.startBeams, ...truss.editBeams].map(b => ({
            p1: b.p1,
            p2: b.p2,
            m: b.m,
            w: b.w,
            l: b.l !== undefined ? b.l : pointDistance(trussGetPin(truss, b.p1), trussGetPin(truss, b.p2)),
            deck: b.deck !== undefined ? b.deck : false,
        }));

        // Cache discs.
        const discs = truss.discs;  // TODO: do we ever wnat to mutate discs?

        // Cache materials.
        const materials = truss.materials;  // TODO: do we ever want to mutate materials?

        // Compute the mass of all pins.
        const movingPins = trussMovingPinsCount(truss);
        const mass = new Float32Array(movingPins);
        function addMass(pin: number, m: number) {
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
        const hmap: SimulationHMap = scene.terrain.hmap.map((h, i) => {
            if (i + 1 >= scene.terrain.hmap.length) {
                return {
                    height: h,
                    nx: 0.0,
                    ny:-1.0,
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
        function hmapAddDeck(i: number, left: number, d: SimulationBeam) {
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
        function getdx(y: Float32Array, pin: number): number {
            if (pin < 0) {
                return fixedPins[fixedPins.length + pin * 2];
            } else {
                return y[pin * 2 + 0];
            }
        }
        function getdy(y: Float32Array, pin: number): number {
            if (pin < 0) {
                return fixedPins[fixedPins.length + pin * 2 + 1];
            } else {
                return y[pin * 2 + 1];
            }
        }
        function getvx(y: Float32Array, pin: number): number {
            if (pin < 0) {
                return 0.0;
            } else {
                return y[vIndex + pin * 2];
            }
        }
        function getvy(y: Float32Array, pin: number): number {
            if (pin < 0) {
                return 0.0;
            } else {
                return y[vIndex + pin * 2 + 1]; 
            }
        }
        function setdx(y: Float32Array, pin: number, val: number) {
            if (pin >= 0) {
                y[pin * 2 + 0] = val;
            }
        }
        function setdy(y: Float32Array, pin: number, val: number) {
            if (pin >= 0) {
                y[pin * 2 + 1] = val;
            }
        }
        function setvx(y: Float32Array, pin: number, val: number) {
            if (pin >= 0) {
                y[vIndex + pin * 2 + 0] = val;
            }
        }
        function setvy(y: Float32Array, pin: number, val: number) {
            if (pin >= 0) {
                y[vIndex + pin * 2 + 1] = val;
            }
        }
        function force(dydt: Float32Array, pin: number, fx: number, fy: number) {
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

        this.dydt = function dydy(_t: number, y: Float32Array, dydt: Float32Array) {
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
                const ux = dx / l;      // Unit vector in directino of beam;
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
                } else {
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
                            continue;   // No Real solutions to intersection.
                        }
                        const rootD = Math.sqrt(D);
                        let t = -b / (2.0 * a);
                        let t1 = (-b - rootD) / (2.0 * a);
                        let t2 = (-b + rootD) / (2.0 * a);
                        if ((t1 <= 0.0 && t2 <= 0.0) || (t1 >= 1.0 && t2 >= 0.0)) {
                            continue;   // Intersections are both before or after deck.
                        }
                        t = Math.max(Math.min(t, 1.0), 0.0);
                        t1 = Math.max(t1, 0.0);
                        t2 = Math.min(t2, 1.0);
    
                        // Compute collision acceleration.
                        // Acceleration is proportional to area 'shadowed' in the disc by the intersecting deck.
                        // This is so that as a disc moves between two deck segments, the acceleration remains constant.
                        const t1x = (1 - t1) * x1 + t1 * x2 - dx;   // Circle centre -> t1 intersection.
                        const t1y = (1 - t1) * y1 + t1 * y2 - dy;
                        const t2x = (1 - t2) * x1 + t2 * x2 - dx;   // Circle centre -> t2 intersection.
                        const t2y = (1 - t2) * y1 + t2 * y2 - dy;
                        const ta = Math.abs(Math.atan2(t1y, t1x) - Math.atan2(t2y, t2x)) % Math.PI;
                        const area = 0.5 * r * r * ta - 0.5 * Math.abs(t1x * t2y - t1y * t2x);
                        const f = 1000.0 * m * area / r;   // TODO: figure out the force.
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
        }

        this.method = new RungeKutta4(y0, this.dydt);
        this.keyframes.set(this.method.t, new Float32Array(this.method.y));
    }

    seekTimes(): IterableIterator<number> {
        return this.keyframes.keys();
    }

    seek(t: number, ec: ElementContext) {
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

    time(): number {
        return this.method.t;
    }

    private next() {    // TODO: make this private?
        const prevT = this.method.t;
        this.method.next(this.h);
        const isKeyframe = Math.floor(prevT / this.keyInterval) !== Math.floor(this.method.t / this.keyInterval);
        if (this.tLatest < this.method.t) {
            if (isKeyframe) {
                this.keyframes.set(this.method.t, new Float32Array(this.method.y));
            }
            this.tLatest = this.method.t;
        } else if (isKeyframe) {
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
            } else {
                console.log(`Replaying frame ${this.method.t} produced the same state`);
            }
        }
    }

    playing(): boolean {
        return this.playTimer !== undefined;
    }

    play(ec: ElementContext) {
        if (this.playTimer !== undefined) {
            return;
        }
        this.playTime = this.method.t;
        this.playTimer = ec.timer(this.playTick, undefined);
    }

    pause(ec: ElementContext) {
        if (this.playTimer === undefined) {
            return;
        }
        ec.clearTimer(this.playTimer);
        this.playTimer = undefined;
    }

    getPin(pin: number): Point2D {
        if (pin < 0) {
            const i = this.fixedPins.length + pin * 2;
            return [this.fixedPins[i], this.fixedPins[i+1]];
        } else {
            const i = pin * 2;
            const y = this.method.y;
            return [y[i], y[i+1]];
        }
    }
};

type OnAddPinHandler = (editIndex: number, pin: number, ec: ElementContext) => void;
type OnRemovePinHandler = (editIndex: number, pin: number, ec: ElementContext) => void;

export class SceneEditor {
    scene: SceneJSON;
    private sim: SceneSimulator | undefined;
    private onAddPinHandlers: Array<OnAddPinHandler>;
    private onRemovePinHandlers: Array<OnRemovePinHandler>;
    editMaterial: number;
    editWidth: number;
    editDeck: boolean;

    constructor(scene: SceneJSON) {
        this.scene = scene;
        this.sim = undefined;
        this.onAddPinHandlers = [];
        this.onRemovePinHandlers = [];
        // TODO: proper initialization;
        this.editMaterial = 0;
        this.editWidth = 1;
        this.editDeck = true;
    }

    simulator(): SceneSimulator {
        if (this.sim === undefined) {
            this.sim = new SceneSimulator(this.scene, 0.001, 1);
        }
        return this.sim;
    }

    private doAddBeam(a: AddBeamAction, ec: ElementContext) {
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
        truss.editBeams.push({p1, p2, m, w, l, deck});
        
        ec.requestDraw();   // TODO: have listeners, and then the UI component can do the requestDraw()
    }
    
    private undoAddBeam(a: AddBeamAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const b = truss.editBeams.pop();
        if (b === undefined) {
            throw new Error('No beams exist');
        }
        if (b.p1 !== a.p1 || b.p2 !== a.p2 || b.m !== a.m || b.w != a.w || b.l !== a.l || b.deck !== a.deck) {
            throw new Error('Beam does not match');
        }
        ec.requestDraw();   // TODO: have listeners, and then the UI component can do the requestDraw()
    }

    private doAddPin(a: AddPinAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const editIndex = truss.editPins.length;
        const pin = truss.startPins.length + editIndex;
        truss.editPins.push(a.pin);
        for (const h of this.onAddPinHandlers) {
            h(editIndex, pin, ec);
        }
    }

    private undoAddPin(a: AddPinAction, ec: ElementContext): void {
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

    private doComposite(a: CompositeAction, ec: ElementContext): void {
        for (let i = 0; i < a.actions.length; i++) {
            this.doAction(a.actions[i], ec);
        }
    }

    private undoComposite(a: CompositeAction, ec: ElementContext): void {
        for (let i = a.actions.length - 1; i >= 0; i--) {
            this.undoAction(a.actions[i], ec);
        }
    }

    private doAction(a: TrussAction, ec: ElementContext): void {
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

    private undoAction(a: TrussAction, ec: ElementContext): void {
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

    onAddPin(handler: OnAddPinHandler) {
        this.onAddPinHandlers.push(handler);
    }

    onRemovePin(handler: OnRemovePinHandler) {
        this.onRemovePinHandlers.push(handler);
    }

    // TODO: Clear handlers?

    undoCount(): number {
        return this.scene.undoStack.length;
    }

    redoCount(): number {
        return this.scene.redoStack.length;
    }

    // Scene mutation methods

    undo(ec: ElementContext): void {
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

    redo(ec: ElementContext): void {
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

    private action(a: TrussAction, ec: ElementContext): void {
        this.scene.redoStack = [a];
        this.redo(ec);    // TODO: Is this too clever?
    }

    addBeam(
        p1: number,
        p2: number,
        ec: ElementContext,
    ): void {
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

    addPin(pin: Point2D, ec: ElementContext): void {
        this.action({type: "add_pin", pin}, ec);
    }

    addPinAndBeam(
        pin: Point2D,
        p2: number,
        ec: ElementContext,
    ): void {
        const truss = this.scene.truss;
        trussAssertPin(truss, p2);
        const p1 = truss.startPins.length + truss.editPins.length;
        this.action({type: "composite", actions: [
            { type: "add_pin", pin},
            {
                type: "add_beam",
                p1,
                p2,
                m: this.editMaterial,
                w: this.editWidth,
                l: undefined,
                deck: this.editDeck
            },
        ]}, ec);
    }
};

/*
export function sceneMethod(scene: Scene): ODEMethod {
    const truss = scene.truss;
    
    const fixedPins = truss.fixedPins;
    const mobilePins = truss.startPins.length + truss.editPins.length;
    // State accessors
    function getdx(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return fixedPins[fixedPins.length + pin][0];
        } else {
            return y[pin * 2 + 0];
        }
    }
    function getdy(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return fixedPins[fixedPins.length + pin][1];
        } else {
            return y[pin * 2 + 1];
        }
    }
    function getvx(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return 0.0;
        } else {
            return y[mobilePins * 2 + pin * 2 + 0];
        }
    }
    function getvy(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return 0.0;
        } else {
            return y[mobilePins * 2 + pin * 2 + 1]; 
        }
    }
    function setdx(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[pin * 2 + 0] = val;
        }
    }
    function setdy(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[pin * 2 + 1] = val;
        }
    }
    function setvx(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 0] = val;
        }
    }
    function setvy(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 1] = val;
        }
    }
    function addvx(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 0] += val;
        }
    }
    function addvy(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 1] += val;
        }
    }
    
    // Split beam mass evenly between pins, initialise beam length.
    const materials = truss.materials;
    const mass = new Float32Array(mobilePins);
    function getm(pin: number): number {
        if (pin < mobilePins) {
            return mass[pin];
        } else {
            return 5.972e24;    // Mass of the Earth.
        }
    }

    const beams = [...truss.startBeams, ...truss.editBeams].map((beam: Beam): SimulationBeam => {
        const p1 = beam.p1;
        const p2 = beam.p2;
        const l = pointDistance(scene.getPin(p1), scene.getPin(p2));
        const m = l * beam.w * materials[beam.m].density;
        if (p1 < mobilePins) {
            mass[p1] += m * 0.5;
        }
        if (p2 < mobilePins) {
            mass[p2] += m * 0.5;
        }
        return { p1, p2, m: beam.m, w: beam.w, l: beam.l || l, deck: beam.deck || false };
    });

    // Disc mass.
    const discs = scene.truss.discs;
    for (const disc of discs) {
        if (disc.p >= mobilePins) {
            throw new Error("Disc attached to non mobile pin");
        }
        mass[disc.p] += disc.r * disc.r * Math.PI * materials[disc.m].density;
    }

    // Check that everything that can move has some mass.
    for (let i = 0; i < mobilePins; i++) {
        if (mass[i] <= 0.0) {
            throw new Error(`Mobile pin ${i} has mass ${mass[i]} <= 0.0`);
        }
    }

    const pitch = scene.width / (scene.terrain.hmap.length - 1);
    const hmap: SimulationHMap = scene.terrain.hmap.map((h, i) => {
        if (i + 1 >= scene.terrain.hmap.length) {
            return {
                height: h,
                nx: 0.0,
                ny: 1.0,
                decks: [],
                deckCount: 0,
            };
        }
        const dy = scene.terrain.hmap[i + 1] - h;
        const l = Math.sqrt(dy * dy + pitch * pitch);
        return {
            height: h,
            nx: -dy / l,
            ny: pitch / l,
            decks: [],
            deckCount: 0,
        };
    });
    function resetDecks() {
        for (const h of hmap) {
            h.deckCount = 0;
        }
    }
    function addDeck(i: number, d: SimulationBeam) {
        if (i < 0 || i >= hmap.length) {
            return;
        }
        const h = hmap[i];
        h.decks[h.deckCount] = d;
        h.deckCount++;
    }
    const tFriction = scene.terrain.friction;

    // Set up initial ODE state vector.
    const y0 = new Float32Array(mobilePins * 4);
    for (let i = 0; i < mobilePins; i++) {
        const d = getPin(truss, i);
        setdx(y0, i, d[0]);
        setdy(y0, i, d[1]);
    }
    // NB: Initial velocities are all 0, no need to initialize.

    const g =  scene.g;
    return new RungeKutta4(y0, function (_t: number, y: Float32Array, dydt: Float32Array) {
        // Derivative of position is velocity.
        for (let i = 0; i < mobilePins; i++) {
            setdx(dydt, i, getvx(y, i));
            setdy(dydt, i, getvy(y, i));
        }
        // Acceleration due to gravity.
        for (let i = 0; i < mobilePins; i++) {
            setvx(dydt, i, g[0]);
            setvy(dydt, i, g[1]);
        }

        // Decks are updated in hmap in the below loop through beams, so clear the previous values.
        resetDecks();

        // Acceleration due to beam stress.
        for (const beam of beams) {
            const E = materials[beam.m].E;
            const p1 = beam.p1;
            const p2 = beam.p2;
            const w = beam.w;
            const l0 = beam.l;
            const dx = getdx(y, p2) - getdx(y, p1);
            const dy = getdy(y, p2) - getdy(y, p1);
            const l = Math.sqrt(dx * dx + dy * dy);
            //const strain = (l - l0) / l0;
            //const stress = strain * E * w;
            const k = E * w / l0;
            const springF = (l - l0) * k;
            const m1 = getm(p1);    // Pin mass
            const m2 = getm(p2);
            const ux = dx / l;      // Unit vector in directino of beam;
            const uy = dy / l;

            // Beam stress force.
            addvx(dydt, p1, ux * springF / m1);
            addvy(dydt, p1, uy * springF / m1);
            addvx(dydt, p2, -ux * springF / m2);
            addvy(dydt, p2, -uy * springF / m2);

            // Damping force.
            const zeta = 0.5;
            const vx = getvx(y, p2) - getvx(y, p1); // Velocity of p2 relative to p1.
            const vy = getvy(y, p2) - getvy(y, p1);
            const v = vx * ux + vy * uy;    // Velocity of p2 relative to p1 in direction of beam.
            // TODO: now that getm returns mass of Earth for fixed pins, we don't need these different if clauses.
            if (p1 < mobilePins && p2 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m1 * m2 / (m1 + m2));
                addvx(dydt, p1, ux * dampF / m1);
                addvy(dydt, p1, uy * dampF / m1);
                addvx(dydt, p2, -ux * dampF / m2);
                addvy(dydt, p2, -uy * dampF / m2);
            } else if (p1 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m1);
                addvx(dydt, p1, ux * dampF / m1);
                addvy(dydt, p1, uy * dampF / m1);
            } else if (p2 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m2);
                addvx(dydt, p2, -ux * dampF / m2);
                addvy(dydt, p2, -uy * dampF / m2);
            }

            // Add decks to accleration structure
            if (beam.deck) {
                const i1 = Math.floor(getdx(y, p1) / pitch);
                const i2 = Math.floor(getdx(y, p2) / pitch);
                const begin = Math.min(i1, i2);
                const end = Math.max(i1, i2);
                for (let i = begin; i <= end; i++) {
                    addDeck(i, beam);
                }
            }
        }
        // Acceleration due to terrain collision, scene border collision
        for (let i = 0; i < mobilePins; i++) {
            const dx = getdx(y, i); // Pin position.
            const dy = getdy(y, i);
            let at = 1000.0; // Acceleration per metre of depth under terrain.
            let nx; // Terrain unit normal.
            let ny;
            if (dx < 0.0) {
                nx = 0.0;
                ny = 1.0;
                at *= -(nx * (dx - 0.0) + ny * (dy - hmap[0].height));
            } else {
                const ti = Math.min(hmap.length - 1, Math.floor(dx / pitch));
                nx = hmap[ti].nx;
                ny = hmap[ti].ny;
                at *= -(nx * (dx - ti * pitch) + ny * (dy - hmap[ti].height));
            }
            if (at > 0.0) {
                addvx(dydt, i, nx * at);
                addvy(dydt, i, ny * at);
                // Friction.
                // Apply acceleration in proportion to at, in direction opposite of tangent projected velocity.
                // Cap acceleration by some fraction of velocity
                // TODO: take friction from beams too (just average beams going into pin?)
                const tx = ny;
                const ty = -nx;
                const tv = getvx(y, i) * tx + getvy(y, i) * ty;
                const af = Math.min(tFriction * at, Math.abs(tv * 100)) * (tv >= 0.0 ? -1.0 : 1.0);
                addvx(dydt, i, tx * af);
                addvy(dydt, i, ty * af);
            }
        }
        // Acceleration due to disc-deck collision.
        for (const disc of discs) {
            const r = disc.r;
            const dx = getdx(y, disc.p);
            // Loop through all hmap buckets that disc overlaps.
            const i1 = Math.floor((dx - r) / pitch);
            const i2 = Math.floor((dx + r) / pitch);
            for (let i = i1; i <= i2; i++) {
                if (i < 0 || i >= hmap.length) {
                    continue;
                }
                // Loop through all decks in those buckets.
                const decks = hmap[i].decks;
                const deckCount = hmap[i].deckCount;
                for (let j = 0; j < deckCount; j++) {
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
                        continue;   // No Real solutions to intersection.
                    }
                    const rootD = Math.sqrt(D);
                    const t = -b / (2.0 * a);
                    let t1 = (-b - rootD) / (2.0 * a);
                    let t2 = (-b + rootD) / (2.0 * a);
                    if ((t1 <= 0.0 && t2 <= 0.0) || (t1 >= 1.0 && t2 >= 0.0)) {
                        continue;   // Intersections are both before or after deck.
                    }
                    t1 = Math.max(t1, 0.0);
                    t2 = Math.min(t2, 1.0);

                    // Compute collision acceleration.
                    // Acceleration is proportional to area 'shadowed' in the disc by the intersecting deck.
                    // This is so that as a disc moves between two deck segments, the acceleration remains constant.
                    const t1x = (1 - t1) * x1 + t1 * x2 - dx;   // Circle centre -> t1 intersection.
                    const t1y = (1 - t1) * y1 + t1 * y2 - dy;
                    const t2x = (1 - t2) * x1 + t2 * x2 - dx;   // Circle centre -> t2 intersection.
                    const t2y = (1 - t2) * y1 + t2 * y2 - dy;
                    const ta = Math.abs(Math.atan2(t1y, t1x) - Math.atan2(t2y, t2x)) % Math.PI;
                    const area = 0.5 * r * r * ta - 0.5 * Math.abs(t1x * t2y - t1y * t2x);
                    const an = 1000.0 * area;   // TODO: figure out what acceleration to use
                    let nx = cx - sx * t;
                    let ny = cy - sy * t;
                    const l = Math.sqrt(nx * nx + ny * ny);
                    nx /= l;
                    ny /= l;

                    // Apply accelerations to the disc.
                    const md = getm(disc.p);
                    const m1 = getm(deck.p1) * (1.0 - t);
                    const m2 = getm(deck.p2) * t;
                    const ad = (m1 + m2) / (md + m1 + m2);  // Share of acceleration for disc, deck endpoints.
                    const a1 = (md + m2) / (md + m1 + m2) * (1.0 - t);
                    const a2 = (md + m1) / (md + m1 + m2) * t;
                    addvx(dydt, disc.p, nx * an * ad);
                    addvy(dydt, disc.p, ny * an * ad);
                    // apply accleration distributed to pins
                    addvx(dydt, deck.p1, -nx * an * a1);
                    addvy(dydt, deck.p1, -ny * an * a1);
                    addvx(dydt, deck.p2, -nx * an * a2);
                    addvy(dydt, deck.p2, -ny * an * a2);

                    // Compute friction and damping.
                    // Get relative velocity.
                    const vx = getvx(y, disc.p) - (1.0 - t) * getvx(y, deck.p1) - t * getvx(y, deck.p2);
                    const vy = getvy(y, disc.p) - (1.0 - t) * getvy(y, deck.p1) - t * getvy(y, deck.p2);
                    const vn = vx * nx + vy * ny;
                    const tx = ny;
                    const ty = -nx;
                    const vt = vx * tx + vy * ty - disc.v;
                    // Totally unscientific way to compute friction from arbitrary constants.
                    const friction = Math.sqrt(materials[disc.m].friction * materials[deck.m].friction);
                    const af = Math.min(an * friction, Math.abs(vt * 100)) * (vt <= 0.0 ? 1.0 : -1.0);
                    const damp = 2;   // TODO: figure out how to derive a reasonable constant.
                    addvx(dydt, disc.p, tx * af * ad - vn * nx * damp);
                    addvy(dydt, disc.p, ty * af * ad - vn * ny * damp);
                    // apply accleration distributed to pins
                    addvx(dydt, deck.p1, -tx * af * a1 + vn * nx * damp);
                    addvy(dydt, deck.p1, -ty * af * a1 + vn * ny * damp);
                    addvx(dydt, deck.p2, -tx * af * a2 + vn * nx * damp);
                    addvy(dydt, deck.p2, -ty * af * a2 + vn * ny * damp);
                }
            }
        }
    });
}

export function sceneRenderer(scene: Scene): TrussRender {
    const truss = scene.truss;
    const materials = truss.materials;
    
    // Pre-render terrain.
    const terrain = scene.terrain;
    const hmap = terrain.hmap;
    const terrainPath = new Path2D();
    terrainPath.moveTo(0.0, 0.0);
    let x = 0.0;
    for (let i = 0; i < hmap.length; i++) {
        terrainPath.lineTo(x, hmap[i]);
        x += terrain.pitch;
    }
    terrainPath.lineTo(x - terrain.pitch, 0.0);
    terrainPath.closePath();

    return function(ctx: CanvasRenderingContext2D, ode: ODEMethod) {
        // Terrain.
        ctx.fillStyle = terrain.style;
        ctx.fill(terrainPath);

        const y = ode.y;

        // Discs
        const discs = truss.discs;
        
        ctx.fillStyle = "red";
        for (const disc of discs) {
            const p = disc.p;
            ctx.beginPath();
            ctx.arc(y[p * 2 + 0], y[p * 2 + 1], disc.r, 0.0, 2 * Math.PI);
            ctx.fill("nonzero");
        }

        // Beams.
        ctx.lineCap = "round";
        for (const beam of beams) {
            ctx.strokeStyle = materials[beam.m].style;
            ctx.lineWidth = beam.w;
            ctx.beginPath();
            const p1 = beam.p1;

            // TODO: figure out how to use ode accessors.
            // Wait, does that mean we need an ODE for a static scene?
            // Will need different methods.
            
            if (p1 < 0) {
                const p = getPin(truss, p1);
                ctx.moveTo(y[p1 * 2 + 0], y[p1 * 2 + 1]);
            } else {
                const pin = pins[p1];
                ctx.moveTo(pin[0], pin[1]);
            }
            const p2 = beam.p2;
            if (p2 < mobilePins) {
                ctx.lineTo(y[p2 * 2 + 0], y[p2 * 2 + 1]);
            } else {
                const pin = pins[p2];
                ctx.lineTo(pin[0], pin[1]);
            }
            ctx.stroke();
        }
    }
}
*/

type CreateBeamPinState = {
    edit: SceneEditor,
    i: number,
    drag?: { p: Point2D, i?: number },
};

function createBeamPinOnDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, state: CreateBeamPinState) {
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

function createBeamPinOnPan(ps: Array<PanPoint>, ec: ElementContext, state: CreateBeamPinState) {
    const truss = state.edit.scene.truss;
    const i = trussGetClosestPin(truss, ps[0].curr, 2, state.i);
    state.drag = {
        p: ps[0].curr,
        i,
    };
    ec.requestDraw();
}

function createBeamPinOnPanEnd(ec: ElementContext, state: CreateBeamPinState) {
    const truss = state.edit.scene.truss;
    if (state.drag === undefined) {
        throw new Error("No drag state OnPanEnd");
    }
    if (state.drag.i === undefined) {
        state.edit.addPinAndBeam(state.drag.p, state.i, ec);
    } else if (!trussBeamExists(truss, state.drag.i, state.i)) {
        // TODO: replace existing beam if one exists (and is editable).
        state.edit.addBeam(state.drag.i, state.i, ec);
    }
    state.drag = undefined;
}

function CreateBeamPin(edit: SceneEditor, i: number): PositionLayout<any, any> {
    const truss = edit.scene.truss;
    const p = trussGetPin(truss, i);
    // If we had state that was passed to all handlers, then we could avoid allocating new handlers per Element.
    return Position<CreateBeamPinState>(p[0] - 2, p[1] - 2, 4, 4, { edit, i })
        .onDraw(createBeamPinOnDraw)
        .onPan(createBeamPinOnPan)
        .onPanEnd(createBeamPinOnPanEnd);
}

function AddTrussEditablePins(edit: SceneEditor): LayoutTakesWidthAndHeight {
    const truss = edit.scene.truss;
    const children = [];
    for (let i = trussEditPinsBegin(truss); i !== trussEditPinsEnd(truss); i++) {
        children.push(CreateBeamPin(edit, i));
    }
    const e = Relative(...children);

    edit.onAddPin((editIndex: number, pin: number, ec: ElementContext) => {
        console.log(`adding Element for pin ${pin} at child[${editIndex}]`);
        addChild(e, CreateBeamPin(edit, pin), ec, editIndex);
        ec.requestLayout();
    });
    edit.onRemovePin((editIndex: number, pin: number, ec: ElementContext) => {
        console.log(`removing Element for pin ${pin} at child[${editIndex}]`);
        removeChild(e, editIndex, ec);
        ec.requestLayout();
    });

    // TODO: e.onDetach for removeing pin observers.
    return e;
}

function AddTrussUneditablePins(edit: SceneEditor): LayoutTakesWidthAndHeight {
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

function AddTrussLayer(scene: SceneEditor): LayoutTakesWidthAndHeight {
    return Layer(
        AddTrussUneditablePins(scene),
        AddTrussEditablePins(scene),
    );
}

function drawBeam(ctx: CanvasRenderingContext2D, p1: Point2D, p2: Point2D, w: number, style: string | CanvasGradient | CanvasPattern, deck?: boolean) {
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();
    if (deck !== undefined && deck) {
        ctx.strokeStyle = "brown";  // TODO: deck style
        ctx.lineWidth = w * 0.75;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
    }
}

function TrussLayer(truss: Truss): LayoutTakesWidthAndHeight {
    return Fill(truss).onDraw((ctx: CanvasRenderingContext2D, _box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, truss: Truss) => {
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

function SimulateLayer(edit: SceneEditor): LayoutTakesWidthAndHeight {
    return Fill(edit).onDraw((ctx: CanvasRenderingContext2D, _box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) => {
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

function drawTerrain(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, vp: LayoutBox, terrain: Terrain) {
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

function drawFill(style: string | CanvasGradient | CanvasPattern) {
    return (ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = style;
        ctx.fillRect(box.left, box.top, box.width, box.height);
    }
}

function undoButtonTap(_p: Point2D, ec: ElementContext, edit: SceneEditor) {
    if (edit.undoCount() > 0) {
        edit.undo(ec);
    }
}

function drawCircleWithArrow(ctx: CanvasRenderingContext2D, box: LayoutBox, ccw: boolean) {
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const r = box.width * 0.333;

    const b = ccw ? Math.PI * 0.75 : Math.PI * 0.25;
    const e = ccw ? Math.PI * 1 : Math.PI * 2;
    const l = ccw ? -Math.PI * 0.3 : Math.PI * 0.3;
    const px = r * Math.cos(e);
    const py = r * Math.sin(e)
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

function drawButtonBorder(ctx: CanvasRenderingContext2D, box: LayoutBox) {
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
}

function undoButtonDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) {
    ctx.fillStyle = "white";
    ctx.strokeStyle = edit.undoCount() === 0 ? "gray" : "black";
    drawButtonBorder(ctx, box);
    drawCircleWithArrow(ctx, box, true);
}

function undoButton(edit: SceneEditor) {
    return Flex(64, 0, edit).onTap(undoButtonTap).onDraw(undoButtonDraw);
}

function redoButton(edit: SceneEditor) {
    return Flex(64, 0, edit).onTap((_p: Point2D, ec: ElementContext, edit: SceneEditor) => {
        if (edit.redoCount() > 0) {
            edit.redo(ec);
        }
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = edit.redoCount() === 0 ? "gray" : "black";
        drawButtonBorder(ctx, box);
        drawCircleWithArrow(ctx, box, false);
    });
}

function deckButton(edit: SceneEditor) {
    return Flex(64, 0, edit).onTap((_p: Point2D, ec: ElementContext, edit: SceneEditor) => {
        edit.editDeck = !edit.editDeck;
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) => {
        ctx.fillStyle = "white";
        drawButtonBorder(ctx, box);
        const x = box.left + box.width * 0.5;
        const y = box.top + box.height * 0.5;
        const r = box.width * 0.333;
        drawBeam(ctx, [x - r, y], [x +  r, y], 16, "black", edit.editDeck);
    });
}

function drawPlay(ctx: CanvasRenderingContext2D, box: LayoutBox) {
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

function drawPause(ctx: CanvasRenderingContext2D, box: LayoutBox) {
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

function playButton(edit: SceneEditor) {
    return Flex(64, 0).onTap((_p: Point2D, ec: ElementContext) => {
        const sim = edit.simulator();
        if (sim.playing()) {
            sim.pause(ec);
        } else {
            sim.play(ec);
        }
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        drawButtonBorder(ctx, box);
        if (edit.simulator().playing()) {
            drawPause(ctx, box);
        } else {
            drawPlay(ctx, box);
        }
    });
}

function drawReset(ctx: CanvasRenderingContext2D, box: LayoutBox) {
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

function resetButton(edit: SceneEditor) {
    return Flex(64, 0).onTap((_p: Point2D, ec: ElementContext) => {
        const sim = edit.simulator();
        if (sim.playing()) {
            sim.pause(ec);
        }
        sim.seek(0, ec);
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        drawButtonBorder(ctx, box);
        drawReset(ctx, box);
    });
}

function tabFiller() {
    return Flex(0, 1).touchSink().onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = "gray";
        ctx.fillRect(box.left, box.top, box.width, box.height);
    });
}

export function SceneElement(sceneJSON: SceneJSON): LayoutTakesWidthAndHeight {
    const edit = new SceneEditor(sceneJSON);

    const sceneUI = Mux(
        ["terrain", "truss", "add_truss"],
        ["terrain", Fill(sceneJSON.terrain).onDraw(drawTerrain)],
        ["truss", TrussLayer(sceneJSON.truss)],
        ["add_truss", AddTrussLayer(edit)],
        ["simulate", SimulateLayer(edit)],
    );

    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");

    const tools = Switch(
        1,
        Left(undoButton(edit), redoButton(edit), tabFiller()),
        Left(deckButton(edit), tabFiller()),
        Left(resetButton(edit), playButton(edit), tabFiller()),
    );

    return Layer(
        Scroll(
            Box(
                sceneJSON.width, sceneJSON.height,
                sceneUI,
            ),
            undefined,
            16,
        ),
        Bottom(
            Flex(64, 0,
                tools,  
            ),
            Flex(64, 0,
                Left(
                    Flex(64, 0).onDraw(drawR).onTap((_p: Point2D, ec: ElementContext) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); edit.simulator().pause(ec) }),
                    Flex(64, 0).onDraw(drawG).onTap((_p: Point2D, ec: ElementContext) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); edit.simulator().pause(ec); }),
                    Flex(64, 0).onDraw(drawB).onTap((_p: Point2D, ec: ElementContext) => {
                        tools.set(2, ec);
                        sceneUI.set(ec, "terrain", "simulate");
                    }),
                ),
            ),
        ),
    );

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
