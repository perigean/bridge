// Copyright 2021 Charles Dueck

import {
    applyAcceleration as particleApplyAcceleration,
    applyForce as particleApplyForce,
    getDx as particleGetDx,
    getDy as particleGetDy,
    getVx as particleGetVx,
    getVy as particleGetVy,
    getLength,
    ParticleInit,
    ParticleSim,
} from "./particlesim.js";
import { pointDistance } from "./point.js";
import { RungeKutta4 } from "./rk4.js";
import { SceneJSON, getPin as jsonGetPin } from "./trussJSON.js";

// The following types store the SceneJSON in a way that is easy to simulate.

type Material = {
    density: number;
    E: number;  // Young's modulus in Pa.
    friction: number;
    style: string | CanvasGradient | CanvasPattern;
    tensionYield: number,
    buckleYield: number,
};

type Beam = {
    p1: number;
    p2: number;
    m: Material;
    w: number;
    l: number;
    deck: boolean;
    hmapi: number; // Index into Terrain.hmap of leftmost point of this beam.
    broken: boolean;
};

type Disc = {
    p: number;
    r: number;
    v: number;
    m: Material;
};

type Terrain = {
    hmap: Array<{
        depth: number;
        nx: number; // Outward (direction of bounce) normal unit vector.
        ny: number;
        decks: Array<Beam>;   // Updated every frame, all decks above this segment.
        deckCount: number;  // Number of indices in decks being used.
    }>;
    pitch: number;
    friction: number;
};

// TODO: for buckling, make the two new beams shorter so they don't immedietaly buckle.

function getDx(y: Float32Array, fixed: Float32Array, i: number): number {
    if (i >= 0) {
        return y[i * 4];
    } else {
        return fixed[i * 2 + fixed.length];
    }
}

function getDy(y: Float32Array, fixed: Float32Array, i: number): number {
    if (i >= 0) {
        return y[i * 4 + 1];
    } else {
        return fixed[i * 2 + 1 + fixed.length];
    }
}

function getVx(y: Float32Array, i: number): number {
    if (i >= 0) {
        return y[i * 4 + 2];
    } else {
        return 0;
    }
}

function getVy(y: Float32Array, i: number): number {
    if (i >= 0) {
        return y[i * 4 + 3];
    } else {
        return 0;
    }
}

function applyAcceleration(dydt: Float32Array, i: number, ax: number, ay: number): void {
    if (i < 0) return;
    particleApplyAcceleration(dydt, i, ax, ay);
}

function applyForce(dydt: Float32Array, m: Float32Array, i: number, fx: number, fy: number): void {
    if (i < 0) return;
    particleApplyForce(dydt, m, i, fx, fy);
}

function pinTerrainCollision(t: Terrain, y: Float32Array, dydt: Float32Array) {
    const hmap = t.hmap;
    const pitch = t.pitch;
    const length = getLength(y);
    for (let i = 0; i < length; i++) {
        const dx = particleGetDx(y, i);
        const dy = particleGetDy(y, i);
        let bounceA = 10000.0; // Acceleration per metre of depth under terrain.
        let nx; // Terrain unit normal (direction of acceleration).
        let ny;
        if (dx < 0.0) {
            nx = 0.0;
            ny = -1.0;
            bounceA *= dy - hmap[0].depth;
        } else {
            const ti = Math.min(hmap.length - 1, Math.floor(dx / pitch));
            nx = hmap[ti].nx;
            ny = hmap[ti].ny;
            // Distance below terrain is normal dot vector from terrain to point.
            bounceA *= -(nx * (dx - ti * pitch) + ny * (dy - hmap[ti].depth));
        }
        if (bounceA <= 0.0) {
            // We are not bouncing.
            continue;
        }
        particleApplyAcceleration(dydt, i, nx * bounceA, ny * bounceA);

        // Friction.
        // Apply acceleration in proportion to at, in direction opposite of tangent projected velocity.
        const tx = ny;
        const ty = -nx;
        const vx = particleGetVx(y, i);
        const vy = particleGetVy(y, i);
        const tv = vx * tx + vy * ty;
        let frictionA = t.friction * bounceA * (tv > 0 ? -1 : 1);
        particleApplyAcceleration(dydt, i, tx * frictionA, ty * frictionA);
    }
}

function discDeckCollision(t: Terrain, beams: Array<Beam>, discs: Array<Disc>, fixed: Float32Array, y: Float32Array, dydt: Float32Array) {
    // set up hmap.decks acceleration structure
    const hmap = t.hmap;
    const hmapi: Map<Beam, number> = new Map();
    const pitch = t.pitch;
    for (const col of hmap) {
        col.deckCount = 0;
    }
    for (const b of beams) {
        if (b.deck) {
            const p1 = b.p1;
            const p2 = b.p2;
            const i1 = Math.floor(getDx(y, fixed, p1) / pitch);
            const i2 = Math.floor(getDx(y, fixed, p2) / pitch);
            const begin = Math.max(Math.min(i1, i2), 0);
            const end = Math.min(Math.max(i1, i2), hmap.length - 1);
            hmapi.set(b, begin);
            //b.hmapi = begin;
            for (let i = begin; i <= end; i++) {
                const col = hmap[i];
                col.decks[col.deckCount] = b;
                col.deckCount++;
            }
        }
    }
    for (const disc of discs) {
        const p = disc.p;
        const r = disc.r;
        const dx = getDx(y, fixed, p);
        // Loop through all hmap buckets that disc overlaps.
        const i1 = Math.max(Math.floor((dx - r) / pitch), 0);
        const i2 = Math.min(Math.floor((dx + r) / pitch), hmap.length - 1);
        for (let i = i1; i <= i2; i++) {
            const decks = hmap[i].decks;
            const deckCount = hmap[i].deckCount;
            for (let j = 0; j < deckCount; j++) {
                const deck = decks[j];
                const deckhmapi = hmapi.get(deck);
                if (deckhmapi === undefined) throw new Error('deck not found in hmapi');
                if (i !== Math.max(i1, deckhmapi)) {
                    // Only compute collision if the bucket we are in is the leftmost
                    // one that contains both the deck and the disc.
                    continue;
                }
                const p1 = deck.p1;
                const p2 = deck.p2;
                const dy = getDy(y, fixed, p);
                const x1 = getDx(y, fixed, p1);
                const y1 = getDy(y, fixed, p1);
                const x2 = getDx(y, fixed, p2);
                const y2 = getDy(y, fixed, p2);
                
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
                const acc = 10000.0 * area / r;
                let nx = cx - sx * t;
                let ny = cy - sy * t;
                const l = Math.sqrt(nx * nx + ny * ny);
                nx /= l;
                ny /= l;

                // Apply acceleration to the disc.
                applyAcceleration(dydt, p, nx * acc, ny * acc);

                // apply accleration distributed to pins
                applyAcceleration(dydt, p1, -nx * acc * (1 - t), -ny * acc * (1 - t));
                applyAcceleration(dydt, p2, -nx * acc * t, -ny * acc * t);

                // Compute friction.
                // Get relative velocity.
                const vx = getVx(y, p) - (1.0 - t) * getVx(y, p1) - t * getVx(y, p2);
                const vy = getVy(y, p) - (1.0 - t) * getVy(y, p1) - t * getVy(y, p2);
                //const vn = vx * nx + vy * ny;
                const tx = ny;
                const ty = -nx;
                const vt = vx * tx + vy * ty - disc.v;
                // Totally unscientific way to compute friction from arbitrary constants.
                const friction = Math.sqrt(disc.m.friction * deck.m.friction);
                const af = acc * friction * (vt <= 0.0 ? 1.0 : -1.0);
                applyAcceleration(dydt, p, tx * af, ty * af);
                applyAcceleration(dydt, p1, -tx * af * (1 - t), -ty * af * (1 - t));
                applyAcceleration(dydt, p2, -tx * af * t, -ty * af * t);
            }
        }
    }
}

function beamStress(beams: Array<Beam>, fixed: Float32Array, y: Float32Array, m: Float32Array, dydt: Float32Array) {
    for (const beam of beams) {
        const p1 = beam.p1;
        const p2 = beam.p2;
        if (p1 < 0 && p2 < 0) {
            // Both ends are not moveable.
            continue;
        }
        const dx = getDx(y, fixed, p2) - getDx(y, fixed, p1);
        const dy = getDy(y, fixed, p2) - getDy(y, fixed, p1);
        let l = Math.sqrt(dx * dx + dy * dy);
        if (l < beam.l * beam.m.buckleYield) {
            //throw new Error('squished beam');
            //console.log('squished beam');
            l = beam.l * beam.m.buckleYield;
        } else if (l > beam.l * beam.m.tensionYield) {
            //throw new Error('streched beam');
            //console.log('stretched beam');
            l = beam.l * beam.m.tensionYield;
        }
        // TODO: Cap compression stress. We get unstable results from very high forces if the beam is shrunk too short due to h being too long.
        const k = beam.m.E * beam.w / beam.l;
        const springF = (l - beam.l) * k;
        const ux = dx / l;      // Unit vector in directino of beam;
        const uy = dy / l;

        // Beam stress force.
        applyForce(dydt, m, p1, ux * springF, uy * springF);
        applyForce(dydt, m, p2, -ux * springF, -uy * springF);
    }
}

export type TrussSimState = {
    particleState: Float32Array;
    beamState: Array<Beam>;
};

// TODO: implement ODEMethod? Might make things much simpler to pass state around.
// hard to decouple ODE Player... Might need to make a TrussPlayer.
export class TrussSim {
    private terrain: Terrain;
    private fixedPins: Float32Array;
    private beams: Array<Beam>;
    private beamsSaved: boolean;    // Has this.beams been returned from save()? If so, we'll need a new one if we mutate.
    private discs: Array<Disc>;
    private particleSim: ParticleSim;

    constructor(scene: SceneJSON) {
        const pitch = scene.width / (scene.terrain.hmap.length - 1);
        const truss = scene.truss;
        this.terrain = {
            hmap: scene.terrain.hmap.map((v, i, hmap) => {
                let nx = 0;
                let ny = -1;
                if (i + 1 < hmap.length) {
                    const dy = scene.terrain.hmap[i + 1] - v;
                    const l = Math.sqrt(dy * dy + pitch * pitch);
                    nx = dy / l;
                    ny = -pitch / l;
                }
                return {
                    depth: v,
                    nx, ny,
                    decks: [],
                    deckCount: 0,
                };
            }),
            pitch,
            friction: scene.terrain.friction,
        };
        const materials: Array<Material> = truss.materials.map(v => ({
            density: v.density,
            E: v.E,
            friction: v.friction,
            style: v.style,
            tensionYield: v.tensionYield,
            buckleYield: v.buckleYield,
        }));
        const fixedPinsJSON = truss.fixedPins;
        this.fixedPins = new Float32Array(fixedPinsJSON.length * 2);
        for (let i = 0; i < fixedPinsJSON.length; i++) {
            const p = fixedPinsJSON[i];
            this.fixedPins[i*2+0] = p[0];
            this.fixedPins[i*2+1] = p[1];
        }
        const beamsJSON = [...truss.trainBeams, ...truss.editBeams];
        this.beams = beamsJSON.map(v => ({
            p1: v.p1,
            p2: v.p2,
            w: v.w,
            l: v.l || pointDistance(jsonGetPin(truss, v.p1), jsonGetPin(truss, v.p2)),
            m: materials[v.m],
            deck: v.deck === true,
            hmapi: -1,  // Will be updated every frame, before computing terrain collision.
            broken: false,
        }));
        this.beamsSaved = false;

        this.discs = truss.discs.map(v => ({
            p: v.p,
            r: v.r,
            v: v.v,
            m: materials[v.m],
        }));
        const particles: ParticleInit[] = [...truss.trainPins, ...truss.editPins].map(d => ({
            d,
            m: 0,   // Initialized below.
        }));
        // For each beam, split the mass between its endpoints.
        for (const b of beamsJSON) {
            const p1fixed = b.p1 < 0;
            const p2fixed = b.p2 < 0;
            const p1 = p1fixed ? fixedPinsJSON[b.p1 + fixedPinsJSON.length] : particles[b.p1].d;
            const p2 = p2fixed ? fixedPinsJSON[b.p2 + fixedPinsJSON.length] : particles[b.p2].d;
            const density = truss.materials[b.m].density;
            const m = density * b.w * pointDistance(p1, p2);
            if (!p1fixed) {
                particles[b.p1].m += m * 0.5;
            }
            if (!p2fixed) {
                particles[b.p2].m += m * 0.5;
            }
        }
        this.particleSim = new ParticleSim(
            RungeKutta4,
            particles,
            scene.g,
            1,  // Damping, TODO: pull from somewhere.
            (_t: number, y: Float32Array, m: Float32Array, dydt: Float32Array) => {
                pinTerrainCollision(this.terrain, y, dydt);
                discDeckCollision(this.terrain, this.beams, this.discs, this.fixedPins, y, dydt);
                beamStress(this.beams, this.fixedPins, y, m, dydt);
            },
        );
    }

    get t(): number {
        return this.particleSim.t;
    }
    next(h: number): void {
        this.particleSim.next(h);
        this.beamBreak();
    }

    save(): TrussSimState {
        this.beamsSaved = true;
        for (const beam of this.beams) {
            Object.freeze(beam);
        }
        Object.freeze(this.beams);
        return {
            particleState: this.particleSim.save(),
            beamState: this.beams,
        };
    }
    restore(t: number, s: TrussSimState): void {
        this.beams = s.beamState;
        this.particleSim.restore(t, s.particleState);
        // this.beams was originally returned from save(), so don't mutate it.
        this.beamsSaved = true;
    }
    stateEquals(s: TrussSimState): boolean {
        if (s.beamState.length !== this.beams.length) {
            console.log('beamState length mismatch');
            return false;
        }
        for (let i = 0; i < this.beams.length; i++) {
            const b1 = s.beamState[i];
            const b2 = this.beams[i];
            if (b1.deck !== b2.deck || b1.l !== b2.l || b1.p1 !== b2.p1 || b1.p2 !== b2.p2 || b1.w !== b2.w) {
                console.log(`beamState mismatch at [${i}]`);
                return false;
            }
        }
        const sim = this.particleSim;
        const length = sim.length();
        if (s.particleState.length !== length * 5) {
            console.log('particleState length mismatch');
        }
        const ps = s.particleState;
        for (let i = 0; i < this.particleSim.length(); i ++) {
            if (sim.getDx(i) !== ps[i * 4]
                    || sim.getDy(i) !== ps[i * 4 + 1]
                    || sim.getVx(i) !== ps[i * 4 + 2]
                    || sim.getVy(i) !== ps[i * 4 + 3]
                    || sim.getM(i) !== ps[length * 4 + i]) {
                console.log(`particleState mismatch at [${i}]`);
                
                return false;
            }
        }
        return true;
    }

    resetBeam(i: number, p1: number, p2: number, l: number): void {
        console.log(`resetBeam ${i} ${p1} ${p2} ${l}, old ${this.beams[i].p1} ${this.beams[i].p2} ${this.beams[i].l}`);
        const dx = this.getDx(p2) - this.getDx(p1);
        const dy = this.getDy(p2) - this.getDy(p1);
        const actuall = Math.sqrt(dx * dx + dy * dy);
        if (actuall * 1.25 < l || actuall * 0.75 > l) {
            throw new Error('pre-stressed beam too stressed');
        }
        if (this.beamsSaved) {
            this.beams = this.beams.slice();
            this.beamsSaved = false;
        }
        const beam = { ...this.beams[i] };
        beam.p1 = p1;
        beam.p2 = p2;
        beam.l = l;
        beam.broken = true;
        Object.freeze(beam);
        this.beams[i] = beam;
    }

    addBeam(p1: number, p2: number, m: Material, w: number, l: number, deck: boolean): number {
        if (this.beamsSaved) {
            this.beams = this.beams.slice();
            this.beamsSaved = false;
        }
        const dx = this.getDx(p2) - this.getDx(p1);
        const dy = this.getDy(p2) - this.getDy(p1);
        const actuall = Math.sqrt(dx * dx + dy * dy);
        if (actuall * 1.25 < l || actuall * 0.75 > l) {
            throw new Error('pre-stressed beam too stressed');
        }
        const beam: Beam = { p1, p2, m, w, l, deck, hmapi: -1, broken: true};
        Object.freeze(beam);
        const i = this.beams.length;
        console.log(`addBeam ${i} ${p1} ${p2} ${w} ${l} ${deck}`);
        this.beams[i] = beam;
        return i;
    }

    getDx(i: number): number {
        if (i >= 0) {
            return this.particleSim.getDx(i);
        } else {
            return this.fixedPins[i * 2 + this.fixedPins.length];
        }
    }
    getDy(i: number): number {
        if (i >= 0) {
            return this.particleSim.getDy(i);
        } else {
            return this.fixedPins[i * 2 + 1 + this.fixedPins.length];
        }
    }
    getVx(i: number): number {
        if (i >= 0) {
            return this.particleSim.getVx(i);
        } else {
            return 0;
        }
    }
    getVy(i: number): number {
        if (i >= 0) {
            return this.particleSim.getVy(i);
        } else {
            return 0;
        }
    }

    private beamBreak(): void {
        for (let i = 0; i < this.beams.length; i++) {
            const beam = this.beams[i];
            if (beam.broken) {
                // Beam has already been broken.
                continue;
            }
            const material = beam.m;
            const p1 = beam.p1;
            const p2 = beam.p2;
            if (p1 < 0 && p2 < 0) {
                // Both ends are not moveable.
                continue;
            }
            const x1 = this.getDx(p1);
            const x2 = this.getDx(p2);
            const dx = x2 - x1;
            const y1 = this.getDy(p1);
            const y2 = this.getDy(p2);
            const dy = y2 - y1;
            const l = Math.sqrt(dx * dx + dy * dy);
            if (l > beam.l * material.tensionYield) {
                // Break the beam at p1.
                const vx = this.getVx(p1);
                const vy = this.getVy(p1);
                const mass = beam.l * beam.w * beam.m.density * 0.5;
                if (p1 > 0) {
                    this.particleSim.reset(p1, this.particleSim.getM(p1) - mass, x1, y1, vx, vy);
                }
                this.resetBeam(i, this.particleSim.add(mass, x1, y1, vx, vy), beam.p2, l);
            } else if (l < beam.l * material.buckleYield) {
                console.log(`buckle ${i}`);
                const mass = beam.l * beam.w * beam.m.density;
                const vx1 = this.getVx(p1);
                const vy1 = this.getVy(p1);
                const vx2 = this.getVx(p2);
                const vy2 = this.getVy(p2);
                // Buckling point is the midpoint.
                const px = (x1 + x2) * 0.5;
                const py = (y1 + y2) * 0.5;
                const pl = Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2));
                const p = this.particleSim.add(
                    mass * 0.5,
                    px, py,
                    (vx1 + vx2) * 0.5 + dy, // Add in some speed perpendicular to beam direction.
                    (vy1 + vy2) * 0.5 - dx,
                );
                if (p1 >= 0) {
                    this.particleSim.reset(p1, this.particleSim.getM(p1) - mass * -0.25, x1, y1, vx1, vy1);
                }
                if (p2 >= 0) {
                    this.particleSim.reset(p2, this.particleSim.getM(p2) - mass * -0.25, x2, y2, vx2, vy2);
                }
                this.resetBeam(i, p1, p, pl);
                this.addBeam(p, p2, beam.m, beam.w, pl, beam.deck);
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        
        for (const b of this.beams) {
            const x1 = this.getDx(b.p1);
            const y1 = this.getDy(b.p1);
            const x2 = this.getDx(b.p2);
            const y2 = this.getDy(b.p2);
            ctx.lineWidth = b.w;
            ctx.lineCap = "round";
            ctx.strokeStyle = b.m.style;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            if (b.deck) {
                ctx.strokeStyle = "brown";  // TODO: deck style
                ctx.lineWidth = b.w * 0.75;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }

        for (const d of this.discs) {
            const dx = this.particleSim.getDx(d.p);
            const dy = this.particleSim.getDy(d.p);
            ctx.fillStyle = d.m.style;
            ctx.beginPath();
            ctx.ellipse(dx, dy, d.r, d.r, 0, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
};
