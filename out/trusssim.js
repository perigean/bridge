// Copyright 2021 Charles Dueck
import { applyAcceleration as particleApplyAcceleration, applyForce as particleApplyForce, getDx as particleGetDx, getDy as particleGetDy, getVx as particleGetVx, getVy as particleGetVy, getLength, ParticleSim, } from "./particlesim.js";
import { pointDistance } from "./point.js";
import { RungeKutta4 } from "./rk4.js";
import { getPin as jsonGetPin } from "./trussJSON.js";
// TODO: for buckling, make the two new beams shorter so they don't immedietaly buckle.
function getDx(y, fixed, i) {
    if (i >= 0) {
        return y[i * 4];
    }
    else {
        return fixed[i * 2 + fixed.length];
    }
}
function getDy(y, fixed, i) {
    if (i >= 0) {
        return y[i * 4 + 1];
    }
    else {
        return fixed[i * 2 + 1 + fixed.length];
    }
}
function getVx(y, i) {
    if (i >= 0) {
        return y[i * 4 + 2];
    }
    else {
        return 0;
    }
}
function getVy(y, i) {
    if (i >= 0) {
        return y[i * 4 + 3];
    }
    else {
        return 0;
    }
}
function applyAcceleration(dydt, i, ax, ay) {
    if (i < 0)
        return;
    particleApplyAcceleration(dydt, i, ax, ay);
}
function applyForce(dydt, m, i, fx, fy) {
    if (i < 0)
        return;
    particleApplyForce(dydt, m, i, fx, fy);
}
function pinTerrainCollision(t, y, dydt) {
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
        }
        else {
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
function discDeckCollision(t, beams, discs, fixed, y, dydt) {
    // set up hmap.decks acceleration structure
    const hmap = t.hmap;
    const hmapi = new Map();
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
                if (deckhmapi === undefined)
                    throw new Error('deck not found in hmapi');
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
function beamStress(beams, fixed, y, m, dydt) {
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
        }
        else if (l > beam.l * beam.m.tensionYield) {
            //throw new Error('streched beam');
            //console.log('stretched beam');
            l = beam.l * beam.m.tensionYield;
        }
        // TODO: Cap compression stress. We get unstable results from very high forces if the beam is shrunk too short due to h being too long.
        const k = beam.m.E * beam.w / beam.l;
        const springF = (l - beam.l) * k;
        const ux = dx / l; // Unit vector in directino of beam;
        const uy = dy / l;
        // Beam stress force.
        applyForce(dydt, m, p1, ux * springF, uy * springF);
        applyForce(dydt, m, p2, -ux * springF, -uy * springF);
    }
}
function beamColor(b, x1, y1, x2, y2, color) {
    const m = b.m;
    if (color === undefined || (b.p1 < 0 && b.p2 < 0)) {
        // No ColorMap for tension/compression is defined, or beam is between fixed pins.
        return m.style;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l = Math.sqrt(dx * dx + dy * dy);
    const minl = b.l * m.buckleYield;
    const maxl = b.l * m.tensionYield;
    const x = (l - minl) / (maxl - minl);
    return color(x);
}
// TODO: implement ODEMethod? Might make things much simpler to pass state around.
// hard to decouple ODE Player... Might need to make a TrussPlayer.
export class TrussSim {
    constructor(scene) {
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
        const materials = truss.materials.map(v => ({
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
            this.fixedPins[i * 2 + 0] = p[0];
            this.fixedPins[i * 2 + 1] = p[1];
        }
        const beamsJSON = [...truss.trainBeams, ...truss.editBeams];
        this.beams = beamsJSON.map(v => ({
            p1: v.p1,
            p2: v.p2,
            w: v.w,
            l: v.l || pointDistance(jsonGetPin(truss, v.p1), jsonGetPin(truss, v.p2)),
            m: materials[v.m],
            deck: v.deck === true,
            hmapi: -1,
            broken: false,
        }));
        this.beamsSaved = false;
        this.discs = truss.discs.map(v => ({
            p: v.p,
            r: v.r,
            v: v.v,
            m: materials[v.m],
        }));
        const particles = [...truss.trainPins, ...truss.editPins].map(d => ({
            d,
            m: 0, // Initialized below.
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
        this.particleSim = new ParticleSim(RungeKutta4, particles, scene.g, 1, // Damping, TODO: pull from somewhere.
        (_t, y, m, dydt) => {
            pinTerrainCollision(this.terrain, y, dydt);
            discDeckCollision(this.terrain, this.beams, this.discs, this.fixedPins, y, dydt);
            beamStress(this.beams, this.fixedPins, y, m, dydt);
        });
        this.color = undefined;
    }
    get t() {
        return this.particleSim.t;
    }
    next(h) {
        this.particleSim.next(h);
        this.beamBreak();
    }
    save() {
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
    restore(t, s) {
        this.beams = s.beamState;
        this.particleSim.restore(t, s.particleState);
        // this.beams was originally returned from save(), so don't mutate it.
        this.beamsSaved = true;
    }
    stateEquals(s) {
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
        for (let i = 0; i < this.particleSim.length(); i++) {
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
    resetBeam(i, p1, p2, l) {
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
        const beam = Object.assign({}, this.beams[i]);
        beam.p1 = p1;
        beam.p2 = p2;
        beam.l = l;
        beam.broken = true;
        Object.freeze(beam);
        this.beams[i] = beam;
    }
    addBeam(p1, p2, m, w, l, deck) {
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
        const beam = { p1, p2, m, w, l, deck, hmapi: -1, broken: true };
        Object.freeze(beam);
        const i = this.beams.length;
        console.log(`addBeam ${i} ${p1} ${p2} ${w} ${l} ${deck}`);
        this.beams[i] = beam;
        return i;
    }
    getDx(i) {
        if (i >= 0) {
            return this.particleSim.getDx(i);
        }
        else {
            return this.fixedPins[i * 2 + this.fixedPins.length];
        }
    }
    getDy(i) {
        if (i >= 0) {
            return this.particleSim.getDy(i);
        }
        else {
            return this.fixedPins[i * 2 + 1 + this.fixedPins.length];
        }
    }
    getVx(i) {
        if (i >= 0) {
            return this.particleSim.getVx(i);
        }
        else {
            return 0;
        }
    }
    getVy(i) {
        if (i >= 0) {
            return this.particleSim.getVy(i);
        }
        else {
            return 0;
        }
    }
    beamBreak() {
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
            }
            else if (l < beam.l * material.buckleYield) {
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
                const p = this.particleSim.add(mass * 0.5, px, py, (vx1 + vx2) * 0.5 + dy, // Add in some speed perpendicular to beam direction.
                (vy1 + vy2) * 0.5 - dx);
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
    draw(ctx) {
        for (const b of this.beams) {
            const x1 = this.getDx(b.p1);
            const y1 = this.getDy(b.p1);
            const x2 = this.getDx(b.p2);
            const y2 = this.getDy(b.p2);
            ctx.lineWidth = b.w;
            ctx.lineCap = "round";
            ctx.strokeStyle = beamColor(b, x1, y1, x2, y2, this.color);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            // Don't draw decks when we have a ColorMap.
            if (b.deck && this.color === undefined) {
                ctx.strokeStyle = "brown"; // TODO: deck style
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
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3NzaW0uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHJ1c3NzaW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRy9CLE9BQU8sRUFDSCxpQkFBaUIsSUFBSSx5QkFBeUIsRUFDOUMsVUFBVSxJQUFJLGtCQUFrQixFQUNoQyxLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixTQUFTLEVBRVQsV0FBVyxHQUNkLE1BQU0sa0JBQWtCLENBQUM7QUFDMUIsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMzQyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ3ZDLE9BQU8sRUFBYSxNQUFNLElBQUksVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUEyQ2pFLHVGQUF1RjtBQUV2RixTQUFTLEtBQUssQ0FBQyxDQUFlLEVBQUUsS0FBbUIsRUFBRSxDQUFTO0lBQzFELElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNSLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztLQUNuQjtTQUFNO1FBQ0gsT0FBTyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDdEM7QUFDTCxDQUFDO0FBRUQsU0FBUyxLQUFLLENBQUMsQ0FBZSxFQUFFLEtBQW1CLEVBQUUsQ0FBUztJQUMxRCxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDUixPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ3ZCO1NBQU07UUFDSCxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDMUM7QUFDTCxDQUFD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QUFFLElBQWE7UUFDNUUsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFO1lBQ2pCLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztTQUMzQjtRQUNELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0MsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM3QyxJQUFJLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFFO1lBQzFDLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztTQUNyRDtRQUNELE1BQU0sSUFBSSxHQUFTLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBQzVCLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxJ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Q0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFNBQVMsRUFBRTtnQkFDcEMsR0FBRyxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUMsQ0FBRSxtQkFBbUI7Z0JBQy9DLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7Z0JBQzNCLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDaEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ25CLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNuQixHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7YUFDaEI7U0FDSjtRQUVELEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUN4QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDMUIsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztTQUNkO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDIxIENoYXJsZXMgRHVlY2tcblxuaW1wb3J0IHsgQ29sb3JNYXAgfSBmcm9tIFwiLi9jb2xvcm1hcC5qc1wiO1xuaW1wb3J0IHtcbiAgICBhcHBseUFjY2VsZXJhdGlvbiBhcyBwYXJ0aWNsZUFwcGx5QWNjZWxlcmF0aW9uLFxuICAgIGFwcGx5Rm9yY2UgYXMgcGFydGljbGVBcHBseUZvcmNlLFxuICAgIGdldER4IGFzIHBhcnRpY2xlR2V0RHgsXG4gICAgZ2V0RHkgYXMgcGFydGljbGVHZXREeSxcbiAgICBnZXRWeCBhcyBwYXJ0aWNsZUdldFZ4LFxuICAgIGdldFZ5IGFzIHBhcnRpY2xlR2V0VnksXG4gICAgZ2V0TGVuZ3RoLFxuICAgIFBhcnRpY2xlSW5pdCxcbiAgICBQYXJ0aWNsZVNpbSxcbn0gZnJvbSBcIi4vcGFydGljbGVzaW0uanNcIjtcbmltcG9ydCB7IHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi9wb2ludC5qc1wiO1xuaW1wb3J0IHsgUnVuZ2VLdXR0YTQgfSBmcm9tIFwiLi9yazQuanNcIjtcbmltcG9ydCB7IFNjZW5lSlNPTiwgZ2V0UGluIGFzIGpzb25HZXRQaW4gfSBmcm9tIFwiLi90cnVzc0pTT04uanNcIjtcblxuLy8gVGhlIGZvbGxvd2luZyB0eXBlcyBzdG9yZSB0aGUgU2NlbmVKU09OIGluIGEgd2F5IHRoYXQgaXMgZWFzeSB0byBzaW11bGF0ZS5cblxudHlwZSBNYXRlcmlhbCA9IHtcbiAgICBkZW5zaXR5OiBudW1iZXI7XG4gICAgRTogbnVtYmVyOyAgLy8gWW91bmcncyBtb2R1bHVzIGluIFBhLlxuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbiAgICB0ZW5zaW9uWWllbGQ6IG51bWJlcixcbiAgICBidWNrbGVZaWVsZDogbnVtYmVyLFxufTtcblxudHlwZSBCZWFtID0ge1xuICAgIHAxOiBudW1iZXI7XG4gICAgcDI6IG51bWJlcjtcbiAgICBtOiBNYXRlcmlhbDtcbiAgICB3OiBudW1iZXI7XG4gICAgbDogbnVtYmVyO1xuICAgIGRlY2s6IGJvb2xlYW47XG4gICAgaG1hcGk6IG51bWJlcjsgLy8gSW5kZXggaW50byBUZXJyYWluLmhtYXAgb2YgbGVmdG1vc3QgcG9pbnQgb2YgdGhpcyBiZWFtLlxuICAgIGJyb2tlbjogYm9vbGVhbjtcbn07XG5cbnR5cGUgRGlzYyA9IHtcbiAgICBwOiBudW1iZXI7XG4gICAgcjogbnVtYmVyO1xuICAgIHY6IG51bWJlcjtcbiAgICBtOiBNYXRlcmlhbDtcbn07XG5cbnR5cGUgVGVycmFpbiA9IHtcbiAgICBobWFwOiBBcnJheTx7XG4gICAgICAgIGRlcHRoOiBudW1iZXI7XG4gICAgICAgIG54OiBudW1iZXI7IC8vIE91dHdhcmQgKGRpcmVjdGlvbiBvZiBib3VuY2UpIG5vcm1hbCB1bml0IHZlY3Rvci5cbiAgICAgICAgbnk6IG51bWJlcjtcbiAgICAgICAgZGVja3M6IEFycmF5PEJlYW0+OyAgIC8vIFVwZGF0ZWQgZXZlcnkgZnJhbWUsIGFsbCBkZWNrcyBhYm92ZSB0aGlzIHNlZ21lbnQuXG4gICAgICAgIGRlY2tDb3VudDogbnVtYmVyOyAgLy8gTnVtYmVyIG9mIGluZGljZXMgaW4gZGVja3MgYmVpbmcgdXNlZC5cbiAgICB9PjtcbiAgICBwaXRjaDogbnVtYmVyO1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG59O1xuXG4vLyBUT0RPOiBmb3IgYnVja2xpbmcsIG1ha2UgdGhlIHR3byBuZXcgYmVhbXMgc2hvcnRlciBzbyB0aGV5IGRvbid0IGltbWVkaWV0YWx5IGJ1Y2tsZS5cblxuZnVuY3Rpb24gZ2V0RHgoeTogRmxvYXQzMkFycmF5LCBmaXhlZDogRmxvYXQzMkFycmF5LCBpOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChpID49IDApIHtcbiAgICAgICAgcmV0dXJuIHlbaSAqIDRdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaXhlZFtpICogMiArIGZpeGVkLmxlbmd0aF07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXREeSh5OiBGbG9hdDMyQXJyYXksIGZpeGVkOiBGbG9hdDMyQXJyYXksIGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKGkgPj0gMCkge1xuICAgICAgICByZXR1cm4geVtpICogNCArIDFdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaXhlZFtpICogMiArIDEgKyBmaXhlZC5sZW5ndGhdO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0VngoeTogRmxvYXQzMkFycmF5LCBpOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChpID49IDApIHtcbiAgICAgICAgcmV0dXJuIHlbaSAqIDQgKyAyXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFZ5KHk6IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgIHJldHVybiB5W2kgKiA0ICsgM107XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcHBseUFjY2VsZXJhdGlvbihkeWR0OiBGbG9hdDMyQXJyYXksIGk6IG51bWJlciwgYXg6IG51bWJlciwgYXk6IG51bWJlcik6IHZvaWQge1xuICAgIGlmIChpIDwgMCkgcmV0dXJuO1xuICAgIHBhcnRpY2xlQXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgaSwgYXgsIGF5KTtcbn1cblxuZnVuY3Rpb24gYXBwbHlGb3JjZShkeWR0OiBGbG9hdDMyQXJyYXksIG06IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyLCBmeDogbnVtYmVyLCBmeTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKGkgPCAwKSByZXR1cm47XG4gICAgcGFydGljbGVBcHBseUZvcmNlKGR5ZHQsIG0sIGksIGZ4LCBmeSk7XG59XG5cbmZ1bmN0aW9uIHBpblRlcnJhaW5Db2xsaXNpb24odDogVGVycmFpbiwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICBjb25zdCBobWFwID0gdC5obWFwO1xuICAgIGNvbnN0IHBpdGNoID0gdC5waXRjaDtcbiAgICBjb25zdCBsZW5ndGggPSBnZXRMZW5ndGgoeSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkeCA9IHBhcnRpY2xlR2V0RHgoeSwgaSk7XG4gICAgICAgIGNvbnN0IGR5ID0gcGFydGljbGVHZXREeSh5LCBpKTtcbiAgICAgICAgbGV0IGJvdW5jZUEgPSAxMDAwMC4wOyAvLyBBY2NlbGVyYXRpb24gcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbCAoZGlyZWN0aW9uIG9mIGFjY2VsZXJhdGlvbikuXG4gICAgICAgIGxldCBueTtcbiAgICAgICAgaWYgKGR4IDwgMC4wKSB7XG4gICAgICAgICAgICBueCA9IDAuMDtcbiAgICAgICAgICAgIG55ID0gLTEuMDtcbiAgICAgICAgICAgIGJvdW5jZUEgKj0gZHkgLSBobWFwWzBdLmRlcHRoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgdGkgPSBNYXRoLm1pbihobWFwLmxlbmd0aCAtIDEsIE1hdGguZmxvb3IoZHggLyBwaXRjaCkpO1xuICAgICAgICAgICAgbnggPSBobWFwW3RpXS5ueDtcbiAgICAgICAgICAgIG55ID0gaG1hcFt0aV0ubnk7XG4gICAgICAgICAgICAvLyBEaXN0YW5jZSBiZWxvdyB0ZXJyYWluIGlzIG5vcm1hbCBkb3QgdmVjdG9yIGZyb20gdGVycmFpbiB0byBwb2ludC5cbiAgICAgICAgICAgIGJvdW5jZUEgKj0gLShueCAqIChkeCAtIHRpICogcGl0Y2gpICsgbnkgKiAoZHkgLSBobWFwW3RpXS5kZXB0aCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChib3VuY2VBIDw9IDAuMCkge1xuICAgICAgICAgICAgLy8gV2UgYXJlIG5vdCBib3VuY2luZy5cbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHBhcnRpY2xlQXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgaSwgbnggKiBib3VuY2VBLCBueSAqIGJvdW5jZUEpO1xuXG4gICAgICAgIC8vIEZyaWN0aW9uLlxuICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gaW4gcHJvcG9ydGlvbiB0byBhdCwgaW4gZGlyZWN0aW9uIG9wcG9zaXRlIG9mIHRhbmdlbnQgcHJvamVjdGVkIHZlbG9jaXR5LlxuICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgY29uc3QgdnggPSBwYXJ0aWNsZUdldFZ4KHksIGkpO1xuICAgICAgICBjb25zdCB2eSA9IHBhcnRpY2xlR2V0VnkoeSwgaSk7XG4gICAgICAgIGNvbnN0IHR2ID0gdnggKiB0eCArIHZ5ICogdHk7XG4gICAgICAgIGxldCBmcmljdGlvbkEgPSB0LmZyaWN0aW9uICogYm91bmNlQSAqICh0diA+IDAgPyAtMSA6IDEpO1xuICAgICAgICBwYXJ0aWNsZUFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIGksIHR4ICogZnJpY3Rpb25BLCB0eSAqIGZyaWN0aW9uQSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkaXNjRGVja0NvbGxpc2lvbih0OiBUZXJyYWluLCBiZWFtczogQXJyYXk8QmVhbT4sIGRpc2NzOiBBcnJheTxEaXNjPiwgZml4ZWQ6IEZsb2F0MzJBcnJheSwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICAvLyBzZXQgdXAgaG1hcC5kZWNrcyBhY2NlbGVyYXRpb24gc3RydWN0dXJlXG4gICAgY29uc3QgaG1hcCA9IHQuaG1hcDtcbiAgICBjb25zdCBobWFwaTogTWFwPEJlYW0sIG51bWJlcj4gPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgcGl0Y2ggPSB0LnBpdGNoO1xuICAgIGZvciAoY29uc3QgY29sIG9mIGhtYXApIHtcbiAgICAgICAgY29sLmRlY2tDb3VudCA9IDA7XG4gICAgfVxuICAgIGZvciAoY29uc3QgYiBvZiBiZWFtcykge1xuICAgICAgICBpZiAoYi5kZWNrKSB7XG4gICAgICAgICAgICBjb25zdCBwMSA9IGIucDE7XG4gICAgICAgICAgICBjb25zdCBwMiA9IGIucDI7XG4gICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0RHgoeSwgZml4ZWQsIHAxKSAvIHBpdGNoKTtcbiAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXREeCh5LCBmaXhlZCwgcDIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1heChNYXRoLm1pbihpMSwgaTIpLCAwKTtcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKE1hdGgubWF4KGkxLCBpMiksIGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICBobWFwaS5zZXQoYiwgYmVnaW4pO1xuICAgICAgICAgICAgLy9iLmhtYXBpID0gYmVnaW47XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2wgPSBobWFwW2ldO1xuICAgICAgICAgICAgICAgIGNvbC5kZWNrc1tjb2wuZGVja0NvdW50XSA9IGI7XG4gICAgICAgICAgICAgICAgY29sLmRlY2tDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICBjb25zdCBwID0gZGlzYy5wO1xuICAgICAgICBjb25zdCByID0gZGlzYy5yO1xuICAgICAgICBjb25zdCBkeCA9IGdldER4KHksIGZpeGVkLCBwKTtcbiAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBobWFwIGJ1Y2tldHMgdGhhdCBkaXNjIG92ZXJsYXBzLlxuICAgICAgICBjb25zdCBpMSA9IE1hdGgubWF4KE1hdGguZmxvb3IoKGR4IC0gcikgLyBwaXRjaCksIDApO1xuICAgICAgICBjb25zdCBpMiA9IE1hdGgubWluKE1hdGguZmxvb3IoKGR4ICsgcikgLyBwaXRjaCksIGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgICAgIGZvciAobGV0IGkgPSBpMTsgaSA8PSBpMjsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkZWNrcyA9IGhtYXBbaV0uZGVja3M7XG4gICAgICAgICAgICBjb25zdCBkZWNrQ291bnQgPSBobWFwW2ldLmRlY2tDb3VudDtcbiAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZGVja0NvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNrID0gZGVja3Nbal07XG4gICAgICAgICAgICAgICAgY29uc3QgZGVja2htYXBpID0gaG1hcGkuZ2V0KGRlY2spO1xuICAgICAgICAgICAgICAgIGlmIChkZWNraG1hcGkgPT09IHVuZGVmaW5lZCkgdGhyb3cgbmV3IEVycm9yKCdkZWNrIG5vdCBmb3VuZCBpbiBobWFwaScpO1xuICAgICAgICAgICAgICAgIGlmIChpICE9PSBNYXRoLm1heChpMSwgZGVja2htYXBpKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IGNvbXB1dGUgY29sbGlzaW9uIGlmIHRoZSBidWNrZXQgd2UgYXJlIGluIGlzIHRoZSBsZWZ0bW9zdFxuICAgICAgICAgICAgICAgICAgICAvLyBvbmUgdGhhdCBjb250YWlucyBib3RoIHRoZSBkZWNrIGFuZCB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gZGVjay5wMTtcbiAgICAgICAgICAgICAgICBjb25zdCBwMiA9IGRlY2sucDI7XG4gICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXREeSh5LCBmaXhlZCwgcCk7XG4gICAgICAgICAgICAgICAgY29uc3QgeDEgPSBnZXREeCh5LCBmaXhlZCwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHkxID0gZ2V0RHkoeSwgZml4ZWQsIHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB4MiA9IGdldER4KHksIGZpeGVkLCBwMik7XG4gICAgICAgICAgICAgICAgY29uc3QgeTIgPSBnZXREeSh5LCBmaXhlZCwgcDIpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIElzIGNvbGxpc2lvbiBoYXBwZW5pbmc/XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ggPSB4MiAtIHgxOyAvLyBWZWN0b3IgdG8gZW5kIG9mIGRlY2sgKGZyb20gc3RhcnQpXG4gICAgICAgICAgICAgICAgY29uc3Qgc3kgPSB5MiAtIHkxO1xuICAgICAgICAgICAgICAgIGNvbnN0IGN4ID0gZHggLSB4MTsgLy8gVmVjdG9yIHRvIGNlbnRyZSBvZiBkaXNjIChmcm9tIHN0YXJ0IG9mIGRlY2spXG4gICAgICAgICAgICAgICAgY29uc3QgY3kgPSBkeSAtIHkxO1xuICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBzeCAqIHN4ICsgc3kgKiBzeTtcbiAgICAgICAgICAgICAgICBjb25zdCBiID0gLTIuMCAqIChjeCAqIHN4ICsgY3kgKiBzeSk7XG4gICAgICAgICAgICAgICAgY29uc3QgYyA9IGN4ICogY3ggKyBjeSAqIGN5IC0gciAqIHI7XG4gICAgICAgICAgICAgICAgY29uc3QgRCA9IGIgKiBiIC0gNC4wICogYSAqIGM7XG4gICAgICAgICAgICAgICAgaWYgKEQgPD0gMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIE5vIFJlYWwgc29sdXRpb25zIHRvIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEQgPSBNYXRoLnNxcnQoRCk7XG4gICAgICAgICAgICAgICAgbGV0IHQgPSAtYiAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICBsZXQgdDEgPSAoLWIgLSByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgbGV0IHQyID0gKC1iICsgcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgIGlmICgodDEgPD0gMC4wICYmIHQyIDw9IDAuMCkgfHwgKHQxID49IDEuMCAmJiB0MiA+PSAwLjApKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIEludGVyc2VjdGlvbnMgYXJlIGJvdGggYmVmb3JlIG9yIGFmdGVyIGRlY2suXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHQgPSBNYXRoLm1heChNYXRoLm1pbih0LCAxLjApLCAwLjApO1xuICAgICAgICAgICAgICAgIHQxID0gTWF0aC5tYXgodDEsIDAuMCk7XG4gICAgICAgICAgICAgICAgdDIgPSBNYXRoLm1pbih0MiwgMS4wKTtcblxuICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgY29sbGlzaW9uIGFjY2VsZXJhdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gaXMgcHJvcG9ydGlvbmFsIHRvIGFyZWEgJ3NoYWRvd2VkJyBpbiB0aGUgZGlzYyBieSB0aGUgaW50ZXJzZWN0aW5nIGRlY2suXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBzbyB0aGF0IGFzIGEgZGlzYyBtb3ZlcyBiZXR3ZWVuIHR3byBkZWNrIHNlZ21lbnRzLCB0aGUgYWNjZWxlcmF0aW9uIHJlbWFpbnMgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgY29uc3QgdDF4ID0gKDEgLSB0MSkgKiB4MSArIHQxICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQxIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICBjb25zdCB0MXkgPSAoMSAtIHQxKSAqIHkxICsgdDEgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgIGNvbnN0IHQyeCA9ICgxIC0gdDIpICogeDEgKyB0MiAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MiBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgY29uc3QgdDJ5ID0gKDEgLSB0MikgKiB5MSArIHQyICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YSA9IE1hdGguYWJzKE1hdGguYXRhbjIodDF5LCB0MXgpIC0gTWF0aC5hdGFuMih0MnksIHQyeCkpICUgTWF0aC5QSTtcbiAgICAgICAgICAgICAgICBjb25zdCBhcmVhID0gMC41ICogciAqIHIgKiB0YSAtIDAuNSAqIE1hdGguYWJzKHQxeCAqIHQyeSAtIHQxeSAqIHQyeCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYWNjID0gMTAwMDAuMCAqIGFyZWEgLyByO1xuICAgICAgICAgICAgICAgIGxldCBueCA9IGN4IC0gc3ggKiB0O1xuICAgICAgICAgICAgICAgIGxldCBueSA9IGN5IC0gc3kgKiB0O1xuICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQobnggKiBueCArIG55ICogbnkpO1xuICAgICAgICAgICAgICAgIG54IC89IGw7XG4gICAgICAgICAgICAgICAgbnkgLz0gbDtcblxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbiB0byB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICBhcHBseUFjY2VsZXJhdGlvbihkeWR0LCBwLCBueCAqIGFjYywgbnkgKiBhY2MpO1xuXG4gICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgIGFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIHAxLCAtbnggKiBhY2MgKiAoMSAtIHQpLCAtbnkgKiBhY2MgKiAoMSAtIHQpKTtcbiAgICAgICAgICAgICAgICBhcHBseUFjY2VsZXJhdGlvbihkeWR0LCBwMiwgLW54ICogYWNjICogdCwgLW55ICogYWNjICogdCk7XG5cbiAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGZyaWN0aW9uLlxuICAgICAgICAgICAgICAgIC8vIEdldCByZWxhdGl2ZSB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldFZ4KHksIHApIC0gKDEuMCAtIHQpICogZ2V0VngoeSwgcDEpIC0gdCAqIGdldFZ4KHksIHAyKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldFZ5KHksIHApIC0gKDEuMCAtIHQpICogZ2V0VnkoeSwgcDEpIC0gdCAqIGdldFZ5KHksIHAyKTtcbiAgICAgICAgICAgICAgICAvL2NvbnN0IHZuID0gdnggKiBueCArIHZ5ICogbnk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICBjb25zdCB2dCA9IHZ4ICogdHggKyB2eSAqIHR5IC0gZGlzYy52O1xuICAgICAgICAgICAgICAgIC8vIFRvdGFsbHkgdW5zY2llbnRpZmljIHdheSB0byBjb21wdXRlIGZyaWN0aW9uIGZyb20gYXJiaXRyYXJ5IGNvbnN0YW50cy5cbiAgICAgICAgICAgICAgICBjb25zdCBmcmljdGlvbiA9IE1hdGguc3FydChkaXNjLm0uZnJpY3Rpb24gKiBkZWNrLm0uZnJpY3Rpb24pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gYWNjICogZnJpY3Rpb24gKiAodnQgPD0gMC4wID8gMS4wIDogLTEuMCk7XG4gICAgICAgICAgICAgICAgYXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgcCwgdHggKiBhZiwgdHkgKiBhZik7XG4gICAgICAgICAgICAgICAgYXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgcDEsIC10eCAqIGFmICogKDEgLSB0KSwgLXR5ICogYWYgKiAoMSAtIHQpKTtcbiAgICAgICAgICAgICAgICBhcHBseUFjY2VsZXJhdGlvbihkeWR0LCBwMiwgLXR4ICogYWYgKiB0LCAtdHkgKiBhZiAqIHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBiZWFtU3RyZXNzKGJlYW1zOiBBcnJheTxCZWFtPiwgZml4ZWQ6IEZsb2F0MzJBcnJheSwgeTogRmxvYXQzMkFycmF5LCBtOiBGbG9hdDMyQXJyYXksIGR5ZHQ6IEZsb2F0MzJBcnJheSkge1xuICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgaWYgKHAxIDwgMCAmJiBwMiA8IDApIHtcbiAgICAgICAgICAgIC8vIEJvdGggZW5kcyBhcmUgbm90IG1vdmVhYmxlLlxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZHggPSBnZXREeCh5LCBmaXhlZCwgcDIpIC0gZ2V0RHgoeSwgZml4ZWQsIHAxKTtcbiAgICAgICAgY29uc3QgZHkgPSBnZXREeSh5LCBmaXhlZCwgcDIpIC0gZ2V0RHkoeSwgZml4ZWQsIHAxKTtcbiAgICAgICAgbGV0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICBpZiAobCA8IGJlYW0ubCAqIGJlYW0ubS5idWNrbGVZaWVsZCkge1xuICAgICAgICAgICAgLy90aHJvdyBuZXcgRXJyb3IoJ3NxdWlzaGVkIGJlYW0nKTtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ3NxdWlzaGVkIGJlYW0nKTtcbiAgICAgICAgICAgIGwgPSBiZWFtLmwgKiBiZWFtLm0uYnVja2xlWWllbGQ7XG4gICAgICAgIH0gZWxzZSBpZiAobCA+IGJlYW0ubCAqIGJlYW0ubS50ZW5zaW9uWWllbGQpIHtcbiAgICAgICAgICAgIC8vdGhyb3cgbmV3IEVycm9yKCdzdHJlY2hlZCBiZWFtJyk7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdzdHJldGNoZWQgYmVhbScpO1xuICAgICAgICAgICAgbCA9IGJlYW0ubCAqIGJlYW0ubS50ZW5zaW9uWWllbGQ7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogQ2FwIGNvbXByZXNzaW9uIHN0cmVzcy4gV2UgZ2V0IHVuc3RhYmxlIHJlc3VsdHMgZnJvbSB2ZXJ5IGhpZ2ggZm9yY2VzIGlmIHRoZSBiZWFtIGlzIHNocnVuayB0b28gc2hvcnQgZHVlIHRvIGggYmVpbmcgdG9vIGxvbmcuXG4gICAgICAgIGNvbnN0IGsgPSBiZWFtLm0uRSAqIGJlYW0udyAvIGJlYW0ubDtcbiAgICAgICAgY29uc3Qgc3ByaW5nRiA9IChsIC0gYmVhbS5sKSAqIGs7XG4gICAgICAgIGNvbnN0IHV4ID0gZHggLyBsOyAgICAgIC8vIFVuaXQgdmVjdG9yIGluIGRpcmVjdGlubyBvZiBiZWFtO1xuICAgICAgICBjb25zdCB1eSA9IGR5IC8gbDtcblxuICAgICAgICAvLyBCZWFtIHN0cmVzcyBmb3JjZS5cbiAgICAgICAgYXBwbHlGb3JjZShkeWR0LCBtLCBwMSwgdXggKiBzcHJpbmdGLCB1eSAqIHNwcmluZ0YpO1xuICAgICAgICBhcHBseUZvcmNlKGR5ZHQsIG0sIHAyLCAtdXggKiBzcHJpbmdGLCAtdXkgKiBzcHJpbmdGKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGJlYW1Db2xvcihiOiBCZWFtLCB4MTogbnVtYmVyLCB5MTogbnVtYmVyLCB4MjogbnVtYmVyLCB5MjogbnVtYmVyLCBjb2xvcjogQ29sb3JNYXAgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4ge1xuICAgIGNvbnN0IG0gPSBiLm07XG4gICAgaWYgKGNvbG9yID09PSB1bmRlZmluZWQgfHwgKGIucDEgPCAwICYmIGIucDIgPCAwKSkge1xuICAgICAgICAvLyBObyBDb2xvck1hcCBmb3IgdGVuc2lvbi9jb21wcmVzc2lvbiBpcyBkZWZpbmVkLCBvciBiZWFtIGlzIGJldHdlZW4gZml4ZWQgcGlucy5cbiAgICAgICAgcmV0dXJuIG0uc3R5bGU7XG4gICAgfVxuICAgIGNvbnN0IGR4ID0geDIgLSB4MTtcbiAgICBjb25zdCBkeSA9IHkyIC0geTE7XG4gICAgY29uc3QgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgY29uc3QgbWlubCA9IGIubCAqIG0uYnVja2xlWWllbGQ7XG4gICAgY29uc3QgbWF4bCA9IGIubCAqIG0udGVuc2lvbllpZWxkO1xuICAgIGNvbnN0IHggPSAobCAtIG1pbmwpIC8gKG1heGwgLSBtaW5sKTtcbiAgICByZXR1cm4gY29sb3IoeCk7XG59XG5cbmV4cG9ydCB0eXBlIFRydXNzU2ltU3RhdGUgPSB7XG4gICAgcGFydGljbGVTdGF0ZTogRmxvYXQzMkFycmF5O1xuICAgIGJlYW1TdGF0ZTogQXJyYXk8QmVhbT47XG59O1xuXG4vLyBUT0RPOiBpbXBsZW1lbnQgT0RFTWV0aG9kPyBNaWdodCBtYWtlIHRoaW5ncyBtdWNoIHNpbXBsZXIgdG8gcGFzcyBzdGF0ZSBhcm91bmQuXG4vLyBoYXJkIHRvIGRlY291cGxlIE9ERSBQbGF5ZXIuLi4gTWlnaHQgbmVlZCB0byBtYWtlIGEgVHJ1c3NQbGF5ZXIuXG5leHBvcnQgY2xhc3MgVHJ1c3NTaW0ge1xuICAgIHByaXZhdGUgdGVycmFpbjogVGVycmFpbjtcbiAgICBwcml2YXRlIGZpeGVkUGluczogRmxvYXQzMkFycmF5O1xuICAgIHByaXZhdGUgYmVhbXM6IEFycmF5PEJlYW0+O1xuICAgIHByaXZhdGUgYmVhbXNTYXZlZDogYm9vbGVhbjsgICAgLy8gSGFzIHRoaXMuYmVhbXMgYmVlbiByZXR1cm5lZCBmcm9tIHNhdmUoKT8gSWYgc28sIHdlJ2xsIG5lZWQgYSBuZXcgb25lIGlmIHdlIG11dGF0ZS5cbiAgICBwcml2YXRlIGRpc2NzOiBBcnJheTxEaXNjPjtcbiAgICBwcml2YXRlIHBhcnRpY2xlU2ltOiBQYXJ0aWNsZVNpbTtcbiAgICBjb2xvcjogQ29sb3JNYXAgfCB1bmRlZmluZWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogU2NlbmVKU09OKSB7XG4gICAgICAgIGNvbnN0IHBpdGNoID0gc2NlbmUud2lkdGggLyAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpO1xuICAgICAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgICAgICB0aGlzLnRlcnJhaW4gPSB7XG4gICAgICAgICAgICBobWFwOiBzY2VuZS50ZXJyYWluLmhtYXAubWFwKCh2LCBpLCBobWFwKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG54ID0gMDtcbiAgICAgICAgICAgICAgICBsZXQgbnkgPSAtMTtcbiAgICAgICAgICAgICAgICBpZiAoaSArIDEgPCBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSB2O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgbnggPSBkeSAvIGw7XG4gICAgICAgICAgICAgICAgICAgIG55ID0gLXBpdGNoIC8gbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGg6IHYsXG4gICAgICAgICAgICAgICAgICAgIG54LCBueSxcbiAgICAgICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgcGl0Y2gsXG4gICAgICAgICAgICBmcmljdGlvbjogc2NlbmUudGVycmFpbi5mcmljdGlvbixcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbWF0ZXJpYWxzOiBBcnJheTxNYXRlcmlhbD4gPSB0cnVzcy5tYXRlcmlhbHMubWFwKHYgPT4gKHtcbiAgICAgICAgICAgIGRlbnNpdHk6IHYuZGVuc2l0eSxcbiAgICAgICAgICAgIEU6IHYuRSxcbiAgICAgICAgICAgIGZyaWN0aW9uOiB2LmZyaWN0aW9uLFxuICAgICAgICAgICAgc3R5bGU6IHYuc3R5bGUsXG4gICAgICAgICAgICB0ZW5zaW9uWWllbGQ6IHYudGVuc2lvbllpZWxkLFxuICAgICAgICAgICAgYnVja2xlWWllbGQ6IHYuYnVja2xlWWllbGQsXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc3QgZml4ZWRQaW5zSlNPTiA9IHRydXNzLmZpeGVkUGlucztcbiAgICAgICAgdGhpcy5maXhlZFBpbnMgPSBuZXcgRmxvYXQzMkFycmF5KGZpeGVkUGluc0pTT04ubGVuZ3RoICogMik7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZml4ZWRQaW5zSlNPTi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcCA9IGZpeGVkUGluc0pTT05baV07XG4gICAgICAgICAgICB0aGlzLmZpeGVkUGluc1tpKjIrMF0gPSBwWzBdO1xuICAgICAgICAgICAgdGhpcy5maXhlZFBpbnNbaSoyKzFdID0gcFsxXTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBiZWFtc0pTT04gPSBbLi4udHJ1c3MudHJhaW5CZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXTtcbiAgICAgICAgdGhpcy5iZWFtcyA9IGJlYW1zSlNPTi5tYXAodiA9PiAoe1xuICAgICAgICAgICAgcDE6IHYucDEsXG4gICAgICAgICAgICBwMjogdi5wMixcbiAgICAgICAgICAgIHc6IHYudyxcbiAgICAgICAgICAgIGw6IHYubCB8fCBwb2ludERpc3RhbmNlKGpzb25HZXRQaW4odHJ1c3MsIHYucDEpLCBqc29uR2V0UGluKHRydXNzLCB2LnAyKSksXG4gICAgICAgICAgICBtOiBtYXRlcmlhbHNbdi5tXSxcbiAgICAgICAgICAgIGRlY2s6IHYuZGVjayA9PT0gdHJ1ZSxcbiAgICAgICAgICAgIGhtYXBpOiAtMSwgIC8vIFdpbGwgYmUgdXBkYXRlZCBldmVyeSBmcmFtZSwgYmVmb3JlIGNvbXB1dGluZyB0ZXJyYWluIGNvbGxpc2lvbi5cbiAgICAgICAgICAgIGJyb2tlbjogZmFsc2UsXG4gICAgICAgIH0pKTtcbiAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5kaXNjcyA9IHRydXNzLmRpc2NzLm1hcCh2ID0+ICh7XG4gICAgICAgICAgICBwOiB2LnAsXG4gICAgICAgICAgICByOiB2LnIsXG4gICAgICAgICAgICB2OiB2LnYsXG4gICAgICAgICAgICBtOiBtYXRlcmlhbHNbdi5tXSxcbiAgICAgICAgfSkpO1xuICAgICAgICBjb25zdCBwYXJ0aWNsZXM6IFBhcnRpY2xlSW5pdFtdID0gWy4uLnRydXNzLnRyYWluUGlucywgLi4udHJ1c3MuZWRpdFBpbnNdLm1hcChkID0+ICh7XG4gICAgICAgICAgICBkLFxuICAgICAgICAgICAgbTogMCwgICAvLyBJbml0aWFsaXplZCBiZWxvdy5cbiAgICAgICAgfSkpO1xuICAgICAgICAvLyBGb3IgZWFjaCBiZWFtLCBzcGxpdCB0aGUgbWFzcyBiZXR3ZWVuIGl0cyBlbmRwb2ludHMuXG4gICAgICAgIGZvciAoY29uc3QgYiBvZiBiZWFtc0pTT04pIHtcbiAgICAgICAgICAgIGNvbnN0IHAxZml4ZWQgPSBiLnAxIDwgMDtcbiAgICAgICAgICAgIGNvbnN0IHAyZml4ZWQgPSBiLnAyIDwgMDtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gcDFmaXhlZCA/IGZpeGVkUGluc0pTT05bYi5wMSArIGZpeGVkUGluc0pTT04ubGVuZ3RoXSA6IHBhcnRpY2xlc1tiLnAxXS5kO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBwMmZpeGVkID8gZml4ZWRQaW5zSlNPTltiLnAyICsgZml4ZWRQaW5zSlNPTi5sZW5ndGhdIDogcGFydGljbGVzW2IucDJdLmQ7XG4gICAgICAgICAgICBjb25zdCBkZW5zaXR5ID0gdHJ1c3MubWF0ZXJpYWxzW2IubV0uZGVuc2l0eTtcbiAgICAgICAgICAgIGNvbnN0IG0gPSBkZW5zaXR5ICogYi53ICogcG9pbnREaXN0YW5jZShwMSwgcDIpO1xuICAgICAgICAgICAgaWYgKCFwMWZpeGVkKSB7XG4gICAgICAgICAgICAgICAgcGFydGljbGVzW2IucDFdLm0gKz0gbSAqIDAuNTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcDJmaXhlZCkge1xuICAgICAgICAgICAgICAgIHBhcnRpY2xlc1tiLnAyXS5tICs9IG0gKiAwLjU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wYXJ0aWNsZVNpbSA9IG5ldyBQYXJ0aWNsZVNpbShcbiAgICAgICAgICAgIFJ1bmdlS3V0dGE0LFxuICAgICAgICAgICAgcGFydGljbGVzLFxuICAgICAgICAgICAgc2NlbmUuZyxcbiAgICAgICAgICAgIDEsICAvLyBEYW1waW5nLCBUT0RPOiBwdWxsIGZyb20gc29tZXdoZXJlLlxuICAgICAgICAgICAgKF90OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgbTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpID0+IHtcbiAgICAgICAgICAgICAgICBwaW5UZXJyYWluQ29sbGlzaW9uKHRoaXMudGVycmFpbiwgeSwgZHlkdCk7XG4gICAgICAgICAgICAgICAgZGlzY0RlY2tDb2xsaXNpb24odGhpcy50ZXJyYWluLCB0aGlzLmJlYW1zLCB0aGlzLmRpc2NzLCB0aGlzLmZpeGVkUGlucywgeSwgZHlkdCk7XG4gICAgICAgICAgICAgICAgYmVhbVN0cmVzcyh0aGlzLmJlYW1zLCB0aGlzLmZpeGVkUGlucywgeSwgbSwgZHlkdCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICApO1xuICAgICAgICB0aGlzLmNvbG9yID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGdldCB0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhcnRpY2xlU2ltLnQ7XG4gICAgfVxuICAgIG5leHQoaDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMucGFydGljbGVTaW0ubmV4dChoKTtcbiAgICAgICAgdGhpcy5iZWFtQnJlYWsoKTtcbiAgICB9XG5cbiAgICBzYXZlKCk6IFRydXNzU2ltU3RhdGUge1xuICAgICAgICB0aGlzLmJlYW1zU2F2ZWQgPSB0cnVlO1xuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdGhpcy5iZWFtcykge1xuICAgICAgICAgICAgT2JqZWN0LmZyZWV6ZShiZWFtKTtcbiAgICAgICAgfVxuICAgICAgICBPYmplY3QuZnJlZXplKHRoaXMuYmVhbXMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGFydGljbGVTdGF0ZTogdGhpcy5wYXJ0aWNsZVNpbS5zYXZlKCksXG4gICAgICAgICAgICBiZWFtU3RhdGU6IHRoaXMuYmVhbXMsXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJlc3RvcmUodDogbnVtYmVyLCBzOiBUcnVzc1NpbVN0YXRlKTogdm9pZCB7XG4gICAgICAgIHRoaXMuYmVhbXMgPSBzLmJlYW1TdGF0ZTtcbiAgICAgICAgdGhpcy5wYXJ0aWNsZVNpbS5yZXN0b3JlKHQsIHMucGFydGljbGVTdGF0ZSk7XG4gICAgICAgIC8vIHRoaXMuYmVhbXMgd2FzIG9yaWdpbmFsbHkgcmV0dXJuZWQgZnJvbSBzYXZlKCksIHNvIGRvbid0IG11dGF0ZSBpdC5cbiAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgc3RhdGVFcXVhbHMoczogVHJ1c3NTaW1TdGF0ZSk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAocy5iZWFtU3RhdGUubGVuZ3RoICE9PSB0aGlzLmJlYW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ2JlYW1TdGF0ZSBsZW5ndGggbWlzbWF0Y2gnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYmVhbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGIxID0gcy5iZWFtU3RhdGVbaV07XG4gICAgICAgICAgICBjb25zdCBiMiA9IHRoaXMuYmVhbXNbaV07XG4gICAgICAgICAgICBpZiAoYjEuZGVjayAhPT0gYjIuZGVjayB8fCBiMS5sICE9PSBiMi5sIHx8IGIxLnAxICE9PSBiMi5wMSB8fCBiMS5wMiAhPT0gYjIucDIgfHwgYjEudyAhPT0gYjIudykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBiZWFtU3RhdGUgbWlzbWF0Y2ggYXQgWyR7aX1dYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNpbSA9IHRoaXMucGFydGljbGVTaW07XG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IHNpbS5sZW5ndGgoKTtcbiAgICAgICAgaWYgKHMucGFydGljbGVTdGF0ZS5sZW5ndGggIT09IGxlbmd0aCAqIDUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdwYXJ0aWNsZVN0YXRlIGxlbmd0aCBtaXNtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBzID0gcy5wYXJ0aWNsZVN0YXRlO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucGFydGljbGVTaW0ubGVuZ3RoKCk7IGkgKyspIHtcbiAgICAgICAgICAgIGlmIChzaW0uZ2V0RHgoaSkgIT09IHBzW2kgKiA0XVxuICAgICAgICAgICAgICAgICAgICB8fCBzaW0uZ2V0RHkoaSkgIT09IHBzW2kgKiA0ICsgMV1cbiAgICAgICAgICAgICAgICAgICAgfHwgc2ltLmdldFZ4KGkpICE9PSBwc1tpICogNCArIDJdXG4gICAgICAgICAgICAgICAgICAgIHx8IHNpbS5nZXRWeShpKSAhPT0gcHNbaSAqIDQgKyAzXVxuICAgICAgICAgICAgICAgICAgICB8fCBzaW0uZ2V0TShpKSAhPT0gcHNbbGVuZ3RoICogNCArIGldKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYHBhcnRpY2xlU3RhdGUgbWlzbWF0Y2ggYXQgWyR7aX1dYCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJlc2V0QmVhbShpOiBudW1iZXIsIHAxOiBudW1iZXIsIHAyOiBudW1iZXIsIGw6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zb2xlLmxvZyhgcmVzZXRCZWFtICR7aX0gJHtwMX0gJHtwMn0gJHtsfSwgb2xkICR7dGhpcy5iZWFtc1tpXS5wMX0gJHt0aGlzLmJlYW1zW2ldLnAyfSAke3RoaXMuYmVhbXNbaV0ubH1gKTtcbiAgICAgICAgY29uc3QgZHggPSB0aGlzLmdldER4KHAyKSAtIHRoaXMuZ2V0RHgocDEpO1xuICAgICAgICBjb25zdCBkeSA9IHRoaXMuZ2V0RHkocDIpIC0gdGhpcy5nZXREeShwMSk7XG4gICAgICAgIGNvbnN0IGFjdHVhbGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICBpZiAoYWN0dWFsbCAqIDEuMjUgPCBsIHx8IGFjdHVhbGwgKiAwLjc1ID4gbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwcmUtc3RyZXNzZWQgYmVhbSB0b28gc3RyZXNzZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5iZWFtc1NhdmVkKSB7XG4gICAgICAgICAgICB0aGlzLmJlYW1zID0gdGhpcy5iZWFtcy5zbGljZSgpO1xuICAgICAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYmVhbSA9IHsgLi4udGhpcy5iZWFtc1tpXSB9O1xuICAgICAgICBiZWFtLnAxID0gcDE7XG4gICAgICAgIGJlYW0ucDIgPSBwMjtcbiAgICAgICAgYmVhbS5sID0gbDtcbiAgICAgICAgYmVhbS5icm9rZW4gPSB0cnVlO1xuICAgICAgICBPYmplY3QuZnJlZXplKGJlYW0pO1xuICAgICAgICB0aGlzLmJlYW1zW2ldID0gYmVhbTtcbiAgICB9XG5cbiAgICBhZGRCZWFtKHAxOiBudW1iZXIsIHAyOiBudW1iZXIsIG06IE1hdGVyaWFsLCB3OiBudW1iZXIsIGw6IG51bWJlciwgZGVjazogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmJlYW1zU2F2ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuYmVhbXMgPSB0aGlzLmJlYW1zLnNsaWNlKCk7XG4gICAgICAgICAgICB0aGlzLmJlYW1zU2F2ZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkeCA9IHRoaXMuZ2V0RHgocDIpIC0gdGhpcy5nZXREeChwMSk7XG4gICAgICAgIGNvbnN0IGR5ID0gdGhpcy5nZXREeShwMikgLSB0aGlzLmdldER5KHAxKTtcbiAgICAgICAgY29uc3QgYWN0dWFsbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgIGlmIChhY3R1YWxsICogMS4yNSA8IGwgfHwgYWN0dWFsbCAqIDAuNzUgPiBsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3ByZS1zdHJlc3NlZCBiZWFtIHRvbyBzdHJlc3NlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJlYW06IEJlYW0gPSB7IHAxLCBwMiwgbSwgdywgbCwgZGVjaywgaG1hcGk6IC0xLCBicm9rZW46IHRydWV9O1xuICAgICAgICBPYmplY3QuZnJlZXplKGJlYW0pO1xuICAgICAgICBjb25zdCBpID0gdGhpcy5iZWFtcy5sZW5ndGg7XG4gICAgICAgIGNvbnNvbGUubG9nKGBhZGRCZWFtICR7aX0gJHtwMX0gJHtwMn0gJHt3fSAke2x9ICR7ZGVja31gKTtcbiAgICAgICAgdGhpcy5iZWFtc1tpXSA9IGJlYW07XG4gICAgICAgIHJldHVybiBpO1xuICAgIH1cblxuICAgIGdldER4KGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnRpY2xlU2ltLmdldER4KGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZml4ZWRQaW5zW2kgKiAyICsgdGhpcy5maXhlZFBpbnMubGVuZ3RoXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXREeShpOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJ0aWNsZVNpbS5nZXREeShpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpeGVkUGluc1tpICogMiArIDEgKyB0aGlzLmZpeGVkUGlucy5sZW5ndGhdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldFZ4KGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnRpY2xlU2ltLmdldFZ4KGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0VnkoaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFydGljbGVTaW0uZ2V0VnkoaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYmVhbUJyZWFrKCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYmVhbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGJlYW0gPSB0aGlzLmJlYW1zW2ldO1xuICAgICAgICAgICAgaWYgKGJlYW0uYnJva2VuKSB7XG4gICAgICAgICAgICAgICAgLy8gQmVhbSBoYXMgYWxyZWFkeSBiZWVuIGJyb2tlbi5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gYmVhbS5tO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgaWYgKHAxIDwgMCAmJiBwMiA8IDApIHtcbiAgICAgICAgICAgICAgICAvLyBCb3RoIGVuZHMgYXJlIG5vdCBtb3ZlYWJsZS5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHgxID0gdGhpcy5nZXREeChwMSk7XG4gICAgICAgICAgICBjb25zdCB4MiA9IHRoaXMuZ2V0RHgocDIpO1xuICAgICAgICAgICAgY29uc3QgZHggPSB4MiAtIHgxO1xuICAgICAgICAgICAgY29uc3QgeTEgPSB0aGlzLmdldER5KHAxKTtcbiAgICAgICAgICAgIGNvbnN0IHkyID0gdGhpcy5nZXREeShwMik7XG4gICAgICAgICAgICBjb25zdCBkeSA9IHkyIC0geTE7XG4gICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgICAgIGlmIChsID4gYmVhbS5sICogbWF0ZXJpYWwudGVuc2lvbllpZWxkKSB7XG4gICAgICAgICAgICAgICAgLy8gQnJlYWsgdGhlIGJlYW0gYXQgcDEuXG4gICAgICAgICAgICAgICAgY29uc3QgdnggPSB0aGlzLmdldFZ4KHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eSA9IHRoaXMuZ2V0VnkocDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hc3MgPSBiZWFtLmwgKiBiZWFtLncgKiBiZWFtLm0uZGVuc2l0eSAqIDAuNTtcbiAgICAgICAgICAgICAgICBpZiAocDEgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFydGljbGVTaW0ucmVzZXQocDEsIHRoaXMucGFydGljbGVTaW0uZ2V0TShwMSkgLSBtYXNzLCB4MSwgeTEsIHZ4LCB2eSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRCZWFtKGksIHRoaXMucGFydGljbGVTaW0uYWRkKG1hc3MsIHgxLCB5MSwgdngsIHZ5KSwgYmVhbS5wMiwgbCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGwgPCBiZWFtLmwgKiBtYXRlcmlhbC5idWNrbGVZaWVsZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBidWNrbGUgJHtpfWApO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hc3MgPSBiZWFtLmwgKiBiZWFtLncgKiBiZWFtLm0uZGVuc2l0eTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eDEgPSB0aGlzLmdldFZ4KHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eTEgPSB0aGlzLmdldFZ5KHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eDIgPSB0aGlzLmdldFZ4KHAyKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eTIgPSB0aGlzLmdldFZ5KHAyKTtcbiAgICAgICAgICAgICAgICAvLyBCdWNrbGluZyBwb2ludCBpcyB0aGUgbWlkcG9pbnQuXG4gICAgICAgICAgICAgICAgY29uc3QgcHggPSAoeDEgKyB4MikgKiAwLjU7XG4gICAgICAgICAgICAgICAgY29uc3QgcHkgPSAoeTEgKyB5MikgKiAwLjU7XG4gICAgICAgICAgICAgICAgY29uc3QgcGwgPSBNYXRoLnNxcnQoTWF0aC5wb3cocHggLSB4MSwgMikgKyBNYXRoLnBvdyhweSAtIHkxLCAyKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucGFydGljbGVTaW0uYWRkKFxuICAgICAgICAgICAgICAgICAgICBtYXNzICogMC41LFxuICAgICAgICAgICAgICAgICAgICBweCwgcHksXG4gICAgICAgICAgICAgICAgICAgICh2eDEgKyB2eDIpICogMC41ICsgZHksIC8vIEFkZCBpbiBzb21lIHNwZWVkIHBlcnBlbmRpY3VsYXIgdG8gYmVhbSBkaXJlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgICh2eTEgKyB2eTIpICogMC41IC0gZHgsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAocDEgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcnRpY2xlU2ltLnJlc2V0KHAxLCB0aGlzLnBhcnRpY2xlU2ltLmdldE0ocDEpIC0gbWFzcyAqIC0wLjI1LCB4MSwgeTEsIHZ4MSwgdnkxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHAyID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVNpbS5yZXNldChwMiwgdGhpcy5wYXJ0aWNsZVNpbS5nZXRNKHAyKSAtIG1hc3MgKiAtMC4yNSwgeDIsIHkyLCB2eDIsIHZ5Mik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRCZWFtKGksIHAxLCBwLCBwbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRCZWFtKHAsIHAyLCBiZWFtLm0sIGJlYW0udywgcGwsIGJlYW0uZGVjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKTogdm9pZCB7XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0aGlzLmJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCB4MSA9IHRoaXMuZ2V0RHgoYi5wMSk7XG4gICAgICAgICAgICBjb25zdCB5MSA9IHRoaXMuZ2V0RHkoYi5wMSk7XG4gICAgICAgICAgICBjb25zdCB4MiA9IHRoaXMuZ2V0RHgoYi5wMik7XG4gICAgICAgICAgICBjb25zdCB5MiA9IHRoaXMuZ2V0RHkoYi5wMik7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYi53O1xuICAgICAgICAgICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBiZWFtQ29sb3IoYiwgeDEsIHkxLCB4MiwgeTIsIHRoaXMuY29sb3IpO1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4Lm1vdmVUbyh4MSwgeTEpO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyh4MiwgeTIpO1xuICAgICAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICAgICAgLy8gRG9uJ3QgZHJhdyBkZWNrcyB3aGVuIHdlIGhhdmUgYSBDb2xvck1hcC5cbiAgICAgICAgICAgIGlmIChiLmRlY2sgJiYgdGhpcy5jb2xvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJicm93blwiOyAgLy8gVE9ETzogZGVjayBzdHlsZVxuICAgICAgICAgICAgICAgIGN0eC5saW5lV2lkdGggPSBiLncgKiAwLjc1O1xuICAgICAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHgxLCB5MSk7XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyh4MiwgeTIpO1xuICAgICAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgZCBvZiB0aGlzLmRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBkeCA9IHRoaXMucGFydGljbGVTaW0uZ2V0RHgoZC5wKTtcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gdGhpcy5wYXJ0aWNsZVNpbS5nZXREeShkLnApO1xuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGQubS5zdHlsZTtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5lbGxpcHNlKGR4LCBkeSwgZC5yLCBkLnIsIDAsIDAsIDIgKiBNYXRoLlBJKTtcbiAgICAgICAgICAgIGN0eC5maWxsKCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuIl19