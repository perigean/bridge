// Copyright Charles Dueck 2020

import { Point2D, pointDistance } from "./point.js";
import { ODEMethod } from "./ode.js";
//import { Euler } from "./euler.js";
import { RungeKutta4 } from "./rk4.js";
import { Box, ElementContext, Fill, Layer, LayoutBox, LayoutHasWidthAndHeight, LayoutTakesWidthAndHeight, OnDrawHandler, Position, PositionLayout, Relative } from "./ui/node.js";

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

// minPin returns the lowest pin ID, inclusive.
function minPin(truss: Truss): number {
    return -truss.fixedPins.length;
}

// maxPin returns the highest pin ID, exclusive (so the number it returns is not a valid pin).
function maxPin(truss: Truss): number {
    return truss.startPins.length + truss.editPins.length;
}

function getPin(truss: Truss, pin: number): Point2D {
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

/*
function assertPin(truss: Truss, pin: number) {
    if (pin < -truss.fixedPins.length || pin >= truss.startPins.length + truss.editPins.length) {
        throw new Error(`Unknown pin index ${pin}`);
    }
}

function assertMaterial(truss: Truss, m: number) {
    if (m < 0 || m >= truss.materials.length) {
        throw new Error(`Unknown material index ${m}`);
    }
}

function getClosestPin(truss: Truss, p: Point2D, maxd: number, beamStart?: number): number | undefined {
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
*/
export type Terrain = {
    hmap: Array<number>;
    friction: number;
    style: string | CanvasGradient | CanvasPattern;
};

type SimulationHMap = Array<{
    height: number;
    nx: number; // Normal unit vector.
    ny: number;
    decks: Array<SimulationBeam>;   // Updated every frame, all decks above this segment.
    deckCount: number;  // Number of indices in decks being used.
}>;

/*
type TrussEdit = {
    do: (truss: Truss) => void;
    undo: (truss: Truss) => void;
};

function addBeam(
    truss: Truss,
    p1: number,
    p2: number,
    m: number,
    w: number,
    l?: number,
    deck?: boolean,
) {
    assertPin(truss, p1);
    assertPin(truss, p2);
    assertMaterial(truss, m);
    if (w <= 0.0) {
        throw new Error(`Beam width must be greater than 0, got ${w}`);
    }
    if (l !== undefined && l <= 0.0) {
        throw new Error(`Beam length must be greater than 0, got ${l}`);
    }
    for (const beam of truss.editBeams) {
        if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
            throw new Error(`Beam between ${p1} and ${p2} already exists`);
        }
    }
    for (const beam of truss.startBeams) {
        if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
            throw new Error(`Beam between ${p1} and ${p2} already exists`);
        }
    }
    truss.editBeams.push({p1, p2, m, w, l, deck});
}

function unaddBeam(
    truss: Truss,
    p1: number,
    p2: number,
    m: number,
    w: number,
    l?: number,
    deck?: boolean,
) {
    const b = truss.editBeams.pop();
    if (b === undefined) {
        throw new Error('No beams exist');
    }
    if (b.p1 !== p1 || b.p2 !== p2 || b.m !== m || b.w != w || b.l !== l || b.deck !== deck) {
        throw new Error('Beam does not match');
    }
}

function addBeamAction(
    p1: number,
    p2: number,
    m: number,
    w: number,
    l?: number,
    deck?: boolean,
    ): TrussEdit {
    return {
        do: (truss: Truss) => {
            addBeam(truss, p1, p2, m, w, l, deck);
        },
        undo: (truss: Truss) => {
            unaddBeam(truss, p1, p2, m, w, l, deck);
        }, 
    }
}

function addPin(truss: Truss, pin: Point2D) {
    truss.editPins.push(pin);
}

function unaddPin(truss: Truss, pin: Point2D) {
    const p = truss.editPins.pop();
    if (p === undefined) {
        throw new Error('No pins exist');
    }
    if (p[0] !== pin[0] || p[1] !== pin[1]) {
        throw new Error('Pin does not match');
    }
}

function addBeamAndPinAction(
    p1: number,
    p2: Point2D,
    m: number,
    w: number,
    l?: number,
    deck?: boolean,
    ): TrussEdit {
    return {
        do: (truss: Truss) => {
            const pin = truss.startPins.length + truss.editPins.length;
            addPin(truss, p2);
            addBeam(truss, p1, pin, m, w, l, deck);
        },
        undo: (truss: Truss) => {
            const pin = truss.startPins.length + truss.editPins.length - 1;
            unaddBeam(truss, p1, pin, m, w, l, deck);
            unaddPin(truss, p2);
        }, 
    }
}
*/
export type Scene = {
    truss: Truss;
    terrain: Terrain;
    height: number;
    width: number;
    g: Point2D;  // Acceleration due to gravity.
}

function drawTerrain(scene: Scene): OnDrawHandler {
    const terrain = scene.terrain;
    const hmap = terrain.hmap;
    const pitch = scene.width / (hmap.length - 1);
    return function(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, vp: LayoutBox) {
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
    };
}

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
        const l = pointDistance(getPin(truss, p1), getPin(truss, p2));
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
/*
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

function drawPin(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox) {
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
}

function CreateBeamPin(truss: Truss, pin: number): PositionLayout {
    const p = getPin(truss, pin);
    return Position(p[0] - 8, p[1] - 8, 16, 16)
        .onDraw(drawPin);
}

function AddTrussLayer(scene: Scene): LayoutTakesWidthAndHeight {
    const truss = scene.truss;
    const minp = minPin(truss);
    const maxp = maxPin(truss);
    const children = new Array<PositionLayout>(maxp - minp);
    for (let i = minp; i < maxp; i++) {
        children[i - minp] = CreateBeamPin(truss, i);
    }
    return Relative(...children).onDraw((ctx: CanvasRenderingContext2D) => {
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "black";
    });
}

export function SceneElement(scene: Scene): LayoutHasWidthAndHeight {
    return Box(
        scene.width, scene.height,
        Layer(
            Fill().onDraw(drawTerrain(scene)),
            AddTrussLayer(scene),
        ),
    );
}
