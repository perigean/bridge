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
        let bounceA = 1000.0; // Acceleration per metre of depth under terrain.
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
                const acc = 1000.0 * area / r; // TODO: figure out the force.
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
                // Buckling point is the midpoint displaced by a bit.
                const displace = (beam.l - l) / beam.l;
                const px = (x1 + x2) * 0.5 + dy * displace;
                const py = (y1 + y2) * 0.5 - dx * displace;
                const pl = Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2));
                const p = this.particleSim.add(mass * 0.5, px, py, (vx1 + vx2) * 0.5, (vy1 + vy2) * 0.5);
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
            ctx.strokeStyle = b.m.style;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            if (b.deck) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3NzaW0uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHJ1c3NzaW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFDSCxpQkFBaUIsSUFBSSx5QkFBeUIsRUFDOUMsVUFBVSxJQUFJLGtCQUFrQixFQUNoQyxLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixTQUFTLEVBRVQsV0FBVyxHQUNkLE1BQU0sa0JBQWtCLENBQUM7QUFDMUIsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMzQyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ3ZDLE9BQU8sRUFBYSxNQUFNLElBQUksVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUEyQ2pFLHVGQUF1RjtBQUV2RixTQUFTLEtBQUssQ0FBQyxDQUFlLEVBQUUsS0FBbUIsRUFBRSxDQUFTO0lBQzFELElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNSLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztLQUNuQjtTQUFNO1FBQ0gsT0FBTyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDdEM7QUFDTCxDQUFDO0FBRUQsU0FBUyxLQUFLLENBQUMsQ0FBZSxFQUFFLEtBQW1CLEVBQUUsQ0FBUztJQUMxRCxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDUixPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ3ZCO1NBQU07UUFDSCxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDMUM7QUFDTCxDQUFD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TSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0IscURBQXFEO2dCQUNyRCxNQUFNLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDdkMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxRQUFRLENBQUM7Z0JBQzNDLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsUUFBUSxDQUFDO2dCQUMzQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQzFCLElBQUksR0FBRyxHQUFHLEVBQ1YsRUFBRSxFQUFFLEVBQUUsRUFDTixDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUN2QyxDQUFDO2dCQUNGLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRTtvQkFDVCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxF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LEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNqRCxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDZDtJQUNMLENBQUM7Q0FDSjtBQUFBLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAyMSBDaGFybGVzIER1ZWNrXG5cbmltcG9ydCB7XG4gICAgYXBwbHlBY2NlbGVyYXRpb24gYXMgcGFydGljbGVBcHBseUFjY2VsZXJhdGlvbixcbiAgICBhcHBseUZvcmNlIGFzIHBhcnRpY2xlQXBwbHlGb3JjZSxcbiAgICBnZXREeCBhcyBwYXJ0aWNsZUdldER4LFxuICAgIGdldER5IGFzIHBhcnRpY2xlR2V0RHksXG4gICAgZ2V0VnggYXMgcGFydGljbGVHZXRWeCxcbiAgICBnZXRWeSBhcyBwYXJ0aWNsZUdldFZ5LFxuICAgIGdldExlbmd0aCxcbiAgICBQYXJ0aWNsZUluaXQsXG4gICAgUGFydGljbGVTaW0sXG59IGZyb20gXCIuL3BhcnRpY2xlc2ltLmpzXCI7XG5pbXBvcnQgeyBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4vcG9pbnQuanNcIjtcbmltcG9ydCB7IFJ1bmdlS3V0dGE0IH0gZnJvbSBcIi4vcms0LmpzXCI7XG5pbXBvcnQgeyBTY2VuZUpTT04sIGdldFBpbiBhcyBqc29uR2V0UGluIH0gZnJvbSBcIi4vdHJ1c3NKU09OLmpzXCI7XG5cbi8vIFRoZSBmb2xsb3dpbmcgdHlwZXMgc3RvcmUgdGhlIFNjZW5lSlNPTiBpbiBhIHdheSB0aGF0IGlzIGVhc3kgdG8gc2ltdWxhdGUuXG5cbnR5cGUgTWF0ZXJpYWwgPSB7XG4gICAgZGVuc2l0eTogbnVtYmVyO1xuICAgIEU6IG51bWJlcjsgIC8vIFlvdW5nJ3MgbW9kdWx1cyBpbiBQYS5cbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgdGVuc2lvbllpZWxkOiBudW1iZXIsXG4gICAgYnVja2xlWWllbGQ6IG51bWJlcixcbn07XG5cbnR5cGUgQmVhbSA9IHtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogTWF0ZXJpYWw7XG4gICAgdzogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBkZWNrOiBib29sZWFuO1xuICAgIGhtYXBpOiBudW1iZXI7IC8vIEluZGV4IGludG8gVGVycmFpbi5obWFwIG9mIGxlZnRtb3N0IHBvaW50IG9mIHRoaXMgYmVhbS5cbiAgICBicm9rZW46IGJvb2xlYW47XG59O1xuXG50eXBlIERpc2MgPSB7XG4gICAgcDogbnVtYmVyO1xuICAgIHI6IG51bWJlcjtcbiAgICB2OiBudW1iZXI7XG4gICAgbTogTWF0ZXJpYWw7XG59O1xuXG50eXBlIFRlcnJhaW4gPSB7XG4gICAgaG1hcDogQXJyYXk8e1xuICAgICAgICBkZXB0aDogbnVtYmVyO1xuICAgICAgICBueDogbnVtYmVyOyAvLyBPdXR3YXJkIChkaXJlY3Rpb24gb2YgYm91bmNlKSBub3JtYWwgdW5pdCB2ZWN0b3IuXG4gICAgICAgIG55OiBudW1iZXI7XG4gICAgICAgIGRlY2tzOiBBcnJheTxCZWFtPjsgICAvLyBVcGRhdGVkIGV2ZXJ5IGZyYW1lLCBhbGwgZGVja3MgYWJvdmUgdGhpcyBzZWdtZW50LlxuICAgICAgICBkZWNrQ291bnQ6IG51bWJlcjsgIC8vIE51bWJlciBvZiBpbmRpY2VzIGluIGRlY2tzIGJlaW5nIHVzZWQuXG4gICAgfT47XG4gICAgcGl0Y2g6IG51bWJlcjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xufTtcblxuLy8gVE9ETzogZm9yIGJ1Y2tsaW5nLCBtYWtlIHRoZSB0d28gbmV3IGJlYW1zIHNob3J0ZXIgc28gdGhleSBkb24ndCBpbW1lZGlldGFseSBidWNrbGUuXG5cbmZ1bmN0aW9uIGdldER4KHk6IEZsb2F0MzJBcnJheSwgZml4ZWQ6IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgIHJldHVybiB5W2kgKiA0XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZml4ZWRbaSAqIDIgKyBmaXhlZC5sZW5ndGhdO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0RHkoeTogRmxvYXQzMkFycmF5LCBmaXhlZDogRmxvYXQzMkFycmF5LCBpOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChpID49IDApIHtcbiAgICAgICAgcmV0dXJuIHlbaSAqIDQgKyAxXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZml4ZWRbaSAqIDIgKyAxICsgZml4ZWQubGVuZ3RoXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFZ4KHk6IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgIHJldHVybiB5W2kgKiA0ICsgMl07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRWeSh5OiBGbG9hdDMyQXJyYXksIGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKGkgPj0gMCkge1xuICAgICAgICByZXR1cm4geVtpICogNCArIDNdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXBwbHlBY2NlbGVyYXRpb24oZHlkdDogRmxvYXQzMkFycmF5LCBpOiBudW1iZXIsIGF4OiBudW1iZXIsIGF5OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoaSA8IDApIHJldHVybjtcbiAgICBwYXJ0aWNsZUFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIGksIGF4LCBheSk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5Rm9yY2UoZHlkdDogRmxvYXQzMkFycmF5LCBtOiBGbG9hdDMyQXJyYXksIGk6IG51bWJlciwgZng6IG51bWJlciwgZnk6IG51bWJlcik6IHZvaWQge1xuICAgIGlmIChpIDwgMCkgcmV0dXJuO1xuICAgIHBhcnRpY2xlQXBwbHlGb3JjZShkeWR0LCBtLCBpLCBmeCwgZnkpO1xufVxuXG5mdW5jdGlvbiBwaW5UZXJyYWluQ29sbGlzaW9uKHQ6IFRlcnJhaW4sIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgY29uc3QgaG1hcCA9IHQuaG1hcDtcbiAgICBjb25zdCBwaXRjaCA9IHQucGl0Y2g7XG4gICAgY29uc3QgbGVuZ3RoID0gZ2V0TGVuZ3RoKHkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZHggPSBwYXJ0aWNsZUdldER4KHksIGkpO1xuICAgICAgICBjb25zdCBkeSA9IHBhcnRpY2xlR2V0RHkoeSwgaSk7XG4gICAgICAgIGxldCBib3VuY2VBID0gMTAwMC4wOyAvLyBBY2NlbGVyYXRpb24gcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbCAoZGlyZWN0aW9uIG9mIGFjY2VsZXJhdGlvbikuXG4gICAgICAgIGxldCBueTtcbiAgICAgICAgaWYgKGR4IDwgMC4wKSB7XG4gICAgICAgICAgICBueCA9IDAuMDtcbiAgICAgICAgICAgIG55ID0gLTEuMDtcbiAgICAgICAgICAgIGJvdW5jZUEgKj0gZHkgLSBobWFwWzBdLmRlcHRoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgdGkgPSBNYXRoLm1pbihobWFwLmxlbmd0aCAtIDEsIE1hdGguZmxvb3IoZHggLyBwaXRjaCkpO1xuICAgICAgICAgICAgbnggPSBobWFwW3RpXS5ueDtcbiAgICAgICAgICAgIG55ID0gaG1hcFt0aV0ubnk7XG4gICAgICAgICAgICAvLyBEaXN0YW5jZSBiZWxvdyB0ZXJyYWluIGlzIG5vcm1hbCBkb3QgdmVjdG9yIGZyb20gdGVycmFpbiB0byBwb2ludC5cbiAgICAgICAgICAgIGJvdW5jZUEgKj0gLShueCAqIChkeCAtIHRpICogcGl0Y2gpICsgbnkgKiAoZHkgLSBobWFwW3RpXS5kZXB0aCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChib3VuY2VBIDw9IDAuMCkge1xuICAgICAgICAgICAgLy8gV2UgYXJlIG5vdCBib3VuY2luZy5cbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHBhcnRpY2xlQXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgaSwgbnggKiBib3VuY2VBLCBueSAqIGJvdW5jZUEpO1xuXG4gICAgICAgIC8vIEZyaWN0aW9uLlxuICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gaW4gcHJvcG9ydGlvbiB0byBhdCwgaW4gZGlyZWN0aW9uIG9wcG9zaXRlIG9mIHRhbmdlbnQgcHJvamVjdGVkIHZlbG9jaXR5LlxuICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgY29uc3QgdnggPSBwYXJ0aWNsZUdldFZ4KHksIGkpO1xuICAgICAgICBjb25zdCB2eSA9IHBhcnRpY2xlR2V0VnkoeSwgaSk7XG4gICAgICAgIGNvbnN0IHR2ID0gdnggKiB0eCArIHZ5ICogdHk7XG4gICAgICAgIGxldCBmcmljdGlvbkEgPSB0LmZyaWN0aW9uICogYm91bmNlQSAqICh0diA+IDAgPyAtMSA6IDEpO1xuICAgICAgICBwYXJ0aWNsZUFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIGksIHR4ICogZnJpY3Rpb25BLCB0eSAqIGZyaWN0aW9uQSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkaXNjRGVja0NvbGxpc2lvbih0OiBUZXJyYWluLCBiZWFtczogQXJyYXk8QmVhbT4sIGRpc2NzOiBBcnJheTxEaXNjPiwgZml4ZWQ6IEZsb2F0MzJBcnJheSwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICAvLyBzZXQgdXAgaG1hcC5kZWNrcyBhY2NlbGVyYXRpb24gc3RydWN0dXJlXG4gICAgY29uc3QgaG1hcCA9IHQuaG1hcDtcbiAgICBjb25zdCBobWFwaTogTWFwPEJlYW0sIG51bWJlcj4gPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgcGl0Y2ggPSB0LnBpdGNoO1xuICAgIGZvciAoY29uc3QgY29sIG9mIGhtYXApIHtcbiAgICAgICAgY29sLmRlY2tDb3VudCA9IDA7XG4gICAgfVxuICAgIGZvciAoY29uc3QgYiBvZiBiZWFtcykge1xuICAgICAgICBpZiAoYi5kZWNrKSB7XG4gICAgICAgICAgICBjb25zdCBwMSA9IGIucDE7XG4gICAgICAgICAgICBjb25zdCBwMiA9IGIucDI7XG4gICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0RHgoeSwgZml4ZWQsIHAxKSAvIHBpdGNoKTtcbiAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXREeCh5LCBmaXhlZCwgcDIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1heChNYXRoLm1pbihpMSwgaTIpLCAwKTtcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKE1hdGgubWF4KGkxLCBpMiksIGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICBobWFwaS5zZXQoYiwgYmVnaW4pO1xuICAgICAgICAgICAgLy9iLmhtYXBpID0gYmVnaW47XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2wgPSBobWFwW2ldO1xuICAgICAgICAgICAgICAgIGNvbC5kZWNrc1tjb2wuZGVja0NvdW50XSA9IGI7XG4gICAgICAgICAgICAgICAgY29sLmRlY2tDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICBjb25zdCBwID0gZGlzYy5wO1xuICAgICAgICBjb25zdCByID0gZGlzYy5yO1xuICAgICAgICBjb25zdCBkeCA9IGdldER4KHksIGZpeGVkLCBwKTtcbiAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBobWFwIGJ1Y2tldHMgdGhhdCBkaXNjIG92ZXJsYXBzLlxuICAgICAgICBjb25zdCBpMSA9IE1hdGgubWF4KE1hdGguZmxvb3IoKGR4IC0gcikgLyBwaXRjaCksIDApO1xuICAgICAgICBjb25zdCBpMiA9IE1hdGgubWluKE1hdGguZmxvb3IoKGR4ICsgcikgLyBwaXRjaCksIGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgICAgIGZvciAobGV0IGkgPSBpMTsgaSA8PSBpMjsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkZWNrcyA9IGhtYXBbaV0uZGVja3M7XG4gICAgICAgICAgICBjb25zdCBkZWNrQ291bnQgPSBobWFwW2ldLmRlY2tDb3VudDtcbiAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZGVja0NvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNrID0gZGVja3Nbal07XG4gICAgICAgICAgICAgICAgY29uc3QgZGVja2htYXBpID0gaG1hcGkuZ2V0KGRlY2spO1xuICAgICAgICAgICAgICAgIGlmIChkZWNraG1hcGkgPT09IHVuZGVmaW5lZCkgdGhyb3cgbmV3IEVycm9yKCdkZWNrIG5vdCBmb3VuZCBpbiBobWFwaScpO1xuICAgICAgICAgICAgICAgIGlmIChpICE9PSBNYXRoLm1heChpMSwgZGVja2htYXBpKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IGNvbXB1dGUgY29sbGlzaW9uIGlmIHRoZSBidWNrZXQgd2UgYXJlIGluIGlzIHRoZSBsZWZ0bW9zdFxuICAgICAgICAgICAgICAgICAgICAvLyBvbmUgdGhhdCBjb250YWlucyBib3RoIHRoZSBkZWNrIGFuZCB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gZGVjay5wMTtcbiAgICAgICAgICAgICAgICBjb25zdCBwMiA9IGRlY2sucDI7XG4gICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXREeSh5LCBmaXhlZCwgcCk7XG4gICAgICAgICAgICAgICAgY29uc3QgeDEgPSBnZXREeCh5LCBmaXhlZCwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHkxID0gZ2V0RHkoeSwgZml4ZWQsIHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB4MiA9IGdldER4KHksIGZpeGVkLCBwMik7XG4gICAgICAgICAgICAgICAgY29uc3QgeTIgPSBnZXREeSh5LCBmaXhlZCwgcDIpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIElzIGNvbGxpc2lvbiBoYXBwZW5pbmc/XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ggPSB4MiAtIHgxOyAvLyBWZWN0b3IgdG8gZW5kIG9mIGRlY2sgKGZyb20gc3RhcnQpXG4gICAgICAgICAgICAgICAgY29uc3Qgc3kgPSB5MiAtIHkxO1xuICAgICAgICAgICAgICAgIGNvbnN0IGN4ID0gZHggLSB4MTsgLy8gVmVjdG9yIHRvIGNlbnRyZSBvZiBkaXNjIChmcm9tIHN0YXJ0IG9mIGRlY2spXG4gICAgICAgICAgICAgICAgY29uc3QgY3kgPSBkeSAtIHkxO1xuICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBzeCAqIHN4ICsgc3kgKiBzeTtcbiAgICAgICAgICAgICAgICBjb25zdCBiID0gLTIuMCAqIChjeCAqIHN4ICsgY3kgKiBzeSk7XG4gICAgICAgICAgICAgICAgY29uc3QgYyA9IGN4ICogY3ggKyBjeSAqIGN5IC0gciAqIHI7XG4gICAgICAgICAgICAgICAgY29uc3QgRCA9IGIgKiBiIC0gNC4wICogYSAqIGM7XG4gICAgICAgICAgICAgICAgaWYgKEQgPD0gMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIE5vIFJlYWwgc29sdXRpb25zIHRvIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdEQgPSBNYXRoLnNxcnQoRCk7XG4gICAgICAgICAgICAgICAgbGV0IHQgPSAtYiAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICBsZXQgdDEgPSAoLWIgLSByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgbGV0IHQyID0gKC1iICsgcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgIGlmICgodDEgPD0gMC4wICYmIHQyIDw9IDAuMCkgfHwgKHQxID49IDEuMCAmJiB0MiA+PSAwLjApKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIEludGVyc2VjdGlvbnMgYXJlIGJvdGggYmVmb3JlIG9yIGFmdGVyIGRlY2suXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHQgPSBNYXRoLm1heChNYXRoLm1pbih0LCAxLjApLCAwLjApO1xuICAgICAgICAgICAgICAgIHQxID0gTWF0aC5tYXgodDEsIDAuMCk7XG4gICAgICAgICAgICAgICAgdDIgPSBNYXRoLm1pbih0MiwgMS4wKTtcblxuICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgY29sbGlzaW9uIGFjY2VsZXJhdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gaXMgcHJvcG9ydGlvbmFsIHRvIGFyZWEgJ3NoYWRvd2VkJyBpbiB0aGUgZGlzYyBieSB0aGUgaW50ZXJzZWN0aW5nIGRlY2suXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBzbyB0aGF0IGFzIGEgZGlzYyBtb3ZlcyBiZXR3ZWVuIHR3byBkZWNrIHNlZ21lbnRzLCB0aGUgYWNjZWxlcmF0aW9uIHJlbWFpbnMgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgY29uc3QgdDF4ID0gKDEgLSB0MSkgKiB4MSArIHQxICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQxIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICBjb25zdCB0MXkgPSAoMSAtIHQxKSAqIHkxICsgdDEgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgIGNvbnN0IHQyeCA9ICgxIC0gdDIpICogeDEgKyB0MiAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MiBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgY29uc3QgdDJ5ID0gKDEgLSB0MikgKiB5MSArIHQyICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YSA9IE1hdGguYWJzKE1hdGguYXRhbjIodDF5LCB0MXgpIC0gTWF0aC5hdGFuMih0MnksIHQyeCkpICUgTWF0aC5QSTtcbiAgICAgICAgICAgICAgICBjb25zdCBhcmVhID0gMC41ICogciAqIHIgKiB0YSAtIDAuNSAqIE1hdGguYWJzKHQxeCAqIHQyeSAtIHQxeSAqIHQyeCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYWNjID0gMTAwMC4wICogYXJlYSAvIHI7ICAgLy8gVE9ETzogZmlndXJlIG91dCB0aGUgZm9yY2UuXG4gICAgICAgICAgICAgICAgbGV0IG54ID0gY3ggLSBzeCAqIHQ7XG4gICAgICAgICAgICAgICAgbGV0IG55ID0gY3kgLSBzeSAqIHQ7XG4gICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChueCAqIG54ICsgbnkgKiBueSk7XG4gICAgICAgICAgICAgICAgbnggLz0gbDtcbiAgICAgICAgICAgICAgICBueSAvPSBsO1xuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIHRvIHRoZSBkaXNjLlxuICAgICAgICAgICAgICAgIGFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIHAsIG54ICogYWNjLCBueSAqIGFjYyk7XG5cbiAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgYXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgcDEsIC1ueCAqIGFjYyAqICgxIC0gdCksIC1ueSAqIGFjYyAqICgxIC0gdCkpO1xuICAgICAgICAgICAgICAgIGFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIHAyLCAtbnggKiBhY2MgKiB0LCAtbnkgKiBhY2MgKiB0KTtcblxuICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgZnJpY3Rpb24uXG4gICAgICAgICAgICAgICAgLy8gR2V0IHJlbGF0aXZlIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0VngoeSwgcCkgLSAoMS4wIC0gdCkgKiBnZXRWeCh5LCBwMSkgLSB0ICogZ2V0VngoeSwgcDIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0VnkoeSwgcCkgLSAoMS4wIC0gdCkgKiBnZXRWeSh5LCBwMSkgLSB0ICogZ2V0VnkoeSwgcDIpO1xuICAgICAgICAgICAgICAgIC8vY29uc3Qgdm4gPSB2eCAqIG54ICsgdnkgKiBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ0ID0gdnggKiB0eCArIHZ5ICogdHkgLSBkaXNjLnY7XG4gICAgICAgICAgICAgICAgLy8gVG90YWxseSB1bnNjaWVudGlmaWMgd2F5IHRvIGNvbXB1dGUgZnJpY3Rpb24gZnJvbSBhcmJpdHJhcnkgY29uc3RhbnRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IGZyaWN0aW9uID0gTWF0aC5zcXJ0KGRpc2MubS5mcmljdGlvbiAqIGRlY2subS5mcmljdGlvbik7XG4gICAgICAgICAgICAgICAgY29uc3QgYWYgPSBhY2MgKiBmcmljdGlvbiAqICh2dCA8PSAwLjAgPyAxLjAgOiAtMS4wKTtcbiAgICAgICAgICAgICAgICBhcHBseUFjY2VsZXJhdGlvbihkeWR0LCBwLCB0eCAqIGFmLCB0eSAqIGFmKTtcbiAgICAgICAgICAgICAgICBhcHBseUFjY2VsZXJhdGlvbihkeWR0LCBwMSwgLXR4ICogYWYgKiAoMSAtIHQpLCAtdHkgKiBhZiAqICgxIC0gdCkpO1xuICAgICAgICAgICAgICAgIGFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIHAyLCAtdHggKiBhZiAqIHQsIC10eSAqIGFmICogdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGJlYW1TdHJlc3MoYmVhbXM6IEFycmF5PEJlYW0+LCBmaXhlZDogRmxvYXQzMkFycmF5LCB5OiBGbG9hdDMyQXJyYXksIG06IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgZm9yIChjb25zdCBiZWFtIG9mIGJlYW1zKSB7XG4gICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICBpZiAocDEgPCAwICYmIHAyIDwgMCkge1xuICAgICAgICAgICAgLy8gQm90aCBlbmRzIGFyZSBub3QgbW92ZWFibGUuXG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkeCA9IGdldER4KHksIGZpeGVkLCBwMikgLSBnZXREeCh5LCBmaXhlZCwgcDEpO1xuICAgICAgICBjb25zdCBkeSA9IGdldER5KHksIGZpeGVkLCBwMikgLSBnZXREeSh5LCBmaXhlZCwgcDEpO1xuICAgICAgICBsZXQgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgIGlmIChsIDwgYmVhbS5sICogYmVhbS5tLmJ1Y2tsZVlpZWxkKSB7XG4gICAgICAgICAgICAvL3Rocm93IG5ldyBFcnJvcignc3F1aXNoZWQgYmVhbScpO1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnc3F1aXNoZWQgYmVhbScpO1xuICAgICAgICAgICAgbCA9IGJlYW0ubCAqIGJlYW0ubS5idWNrbGVZaWVsZDtcbiAgICAgICAgfSBlbHNlIGlmIChsID4gYmVhbS5sICogYmVhbS5tLnRlbnNpb25ZaWVsZCkge1xuICAgICAgICAgICAgLy90aHJvdyBuZXcgRXJyb3IoJ3N0cmVjaGVkIGJlYW0nKTtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ3N0cmV0Y2hlZCBiZWFtJyk7XG4gICAgICAgICAgICBsID0gYmVhbS5sICogYmVhbS5tLnRlbnNpb25ZaWVsZDtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPOiBDYXAgY29tcHJlc3Npb24gc3RyZXNzLiBXZSBnZXQgdW5zdGFibGUgcmVzdWx0cyBmcm9tIHZlcnkgaGlnaCBmb3JjZXMgaWYgdGhlIGJlYW0gaXMgc2hydW5rIHRvbyBzaG9ydCBkdWUgdG8gaCBiZWluZyB0b28gbG9uZy5cbiAgICAgICAgY29uc3QgayA9IGJlYW0ubS5FICogYmVhbS53IC8gYmVhbS5sO1xuICAgICAgICBjb25zdCBzcHJpbmdGID0gKGwgLSBiZWFtLmwpICogaztcbiAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgIGNvbnN0IHV5ID0gZHkgLyBsO1xuXG4gICAgICAgIC8vIEJlYW0gc3RyZXNzIGZvcmNlLlxuICAgICAgICBhcHBseUZvcmNlKGR5ZHQsIG0sIHAxLCB1eCAqIHNwcmluZ0YsIHV5ICogc3ByaW5nRik7XG4gICAgICAgIGFwcGx5Rm9yY2UoZHlkdCwgbSwgcDIsIC11eCAqIHNwcmluZ0YsIC11eSAqIHNwcmluZ0YpO1xuICAgIH1cbn1cblxuZXhwb3J0IHR5cGUgVHJ1c3NTaW1TdGF0ZSA9IHtcbiAgICBwYXJ0aWNsZVN0YXRlOiBGbG9hdDMyQXJyYXk7XG4gICAgYmVhbVN0YXRlOiBBcnJheTxCZWFtPjtcbn07XG5cbi8vIFRPRE86IGltcGxlbWVudCBPREVNZXRob2Q/IE1pZ2h0IG1ha2UgdGhpbmdzIG11Y2ggc2ltcGxlciB0byBwYXNzIHN0YXRlIGFyb3VuZC5cbi8vIGhhcmQgdG8gZGVjb3VwbGUgT0RFIFBsYXllci4uLiBNaWdodCBuZWVkIHRvIG1ha2UgYSBUcnVzc1BsYXllci5cbmV4cG9ydCBjbGFzcyBUcnVzc1NpbSB7XG4gICAgcHJpdmF0ZSB0ZXJyYWluOiBUZXJyYWluO1xuICAgIHByaXZhdGUgZml4ZWRQaW5zOiBGbG9hdDMyQXJyYXk7XG4gICAgcHJpdmF0ZSBiZWFtczogQXJyYXk8QmVhbT47XG4gICAgcHJpdmF0ZSBiZWFtc1NhdmVkOiBib29sZWFuOyAgICAvLyBIYXMgdGhpcy5iZWFtcyBiZWVuIHJldHVybmVkIGZyb20gc2F2ZSgpPyBJZiBzbywgd2UnbGwgbmVlZCBhIG5ldyBvbmUgaWYgd2UgbXV0YXRlLlxuICAgIHByaXZhdGUgZGlzY3M6IEFycmF5PERpc2M+O1xuICAgIHByaXZhdGUgcGFydGljbGVTaW06IFBhcnRpY2xlU2ltO1xuXG4gICAgY29uc3RydWN0b3Ioc2NlbmU6IFNjZW5lSlNPTikge1xuICAgICAgICBjb25zdCBwaXRjaCA9IHNjZW5lLndpZHRoIC8gKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKTtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICAgICAgdGhpcy50ZXJyYWluID0ge1xuICAgICAgICAgICAgaG1hcDogc2NlbmUudGVycmFpbi5obWFwLm1hcCgodiwgaSwgaG1hcCkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBueCA9IDA7XG4gICAgICAgICAgICAgICAgbGV0IG55ID0gLTE7XG4gICAgICAgICAgICAgICAgaWYgKGkgKyAxIDwgaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBzY2VuZS50ZXJyYWluLmhtYXBbaSArIDFdIC0gdjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeSAqIGR5ICsgcGl0Y2ggKiBwaXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIG54ID0gZHkgLyBsO1xuICAgICAgICAgICAgICAgICAgICBueSA9IC1waXRjaCAvIGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoOiB2LFxuICAgICAgICAgICAgICAgICAgICBueCwgbnksXG4gICAgICAgICAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIHBpdGNoLFxuICAgICAgICAgICAgZnJpY3Rpb246IHNjZW5lLnRlcnJhaW4uZnJpY3Rpb24sXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IG1hdGVyaWFsczogQXJyYXk8TWF0ZXJpYWw+ID0gdHJ1c3MubWF0ZXJpYWxzLm1hcCh2ID0+ICh7XG4gICAgICAgICAgICBkZW5zaXR5OiB2LmRlbnNpdHksXG4gICAgICAgICAgICBFOiB2LkUsXG4gICAgICAgICAgICBmcmljdGlvbjogdi5mcmljdGlvbixcbiAgICAgICAgICAgIHN0eWxlOiB2LnN0eWxlLFxuICAgICAgICAgICAgdGVuc2lvbllpZWxkOiB2LnRlbnNpb25ZaWVsZCxcbiAgICAgICAgICAgIGJ1Y2tsZVlpZWxkOiB2LmJ1Y2tsZVlpZWxkLFxuICAgICAgICB9KSk7XG4gICAgICAgIGNvbnN0IGZpeGVkUGluc0pTT04gPSB0cnVzcy5maXhlZFBpbnM7XG4gICAgICAgIHRoaXMuZml4ZWRQaW5zID0gbmV3IEZsb2F0MzJBcnJheShmaXhlZFBpbnNKU09OLmxlbmd0aCAqIDIpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpeGVkUGluc0pTT04ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBmaXhlZFBpbnNKU09OW2ldO1xuICAgICAgICAgICAgdGhpcy5maXhlZFBpbnNbaSoyKzBdID0gcFswXTtcbiAgICAgICAgICAgIHRoaXMuZml4ZWRQaW5zW2kqMisxXSA9IHBbMV07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYmVhbXNKU09OID0gWy4uLnRydXNzLnRyYWluQmVhbXMsIC4uLnRydXNzLmVkaXRCZWFtc107XG4gICAgICAgIHRoaXMuYmVhbXMgPSBiZWFtc0pTT04ubWFwKHYgPT4gKHtcbiAgICAgICAgICAgIHAxOiB2LnAxLFxuICAgICAgICAgICAgcDI6IHYucDIsXG4gICAgICAgICAgICB3OiB2LncsXG4gICAgICAgICAgICBsOiB2LmwgfHwgcG9pbnREaXN0YW5jZShqc29uR2V0UGluKHRydXNzLCB2LnAxKSwganNvbkdldFBpbih0cnVzcywgdi5wMikpLFxuICAgICAgICAgICAgbTogbWF0ZXJpYWxzW3YubV0sXG4gICAgICAgICAgICBkZWNrOiB2LmRlY2sgPT09IHRydWUsXG4gICAgICAgICAgICBobWFwaTogLTEsICAvLyBXaWxsIGJlIHVwZGF0ZWQgZXZlcnkgZnJhbWUsIGJlZm9yZSBjb21wdXRpbmcgdGVycmFpbiBjb2xsaXNpb24uXG4gICAgICAgICAgICBicm9rZW46IGZhbHNlLFxuICAgICAgICB9KSk7XG4gICAgICAgIHRoaXMuYmVhbXNTYXZlZCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuZGlzY3MgPSB0cnVzcy5kaXNjcy5tYXAodiA9PiAoe1xuICAgICAgICAgICAgcDogdi5wLFxuICAgICAgICAgICAgcjogdi5yLFxuICAgICAgICAgICAgdjogdi52LFxuICAgICAgICAgICAgbTogbWF0ZXJpYWxzW3YubV0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc3QgcGFydGljbGVzOiBQYXJ0aWNsZUluaXRbXSA9IFsuLi50cnVzcy50cmFpblBpbnMsIC4uLnRydXNzLmVkaXRQaW5zXS5tYXAoZCA9PiAoe1xuICAgICAgICAgICAgZCxcbiAgICAgICAgICAgIG06IDAsICAgLy8gSW5pdGlhbGl6ZWQgYmVsb3cuXG4gICAgICAgIH0pKTtcbiAgICAgICAgLy8gRm9yIGVhY2ggYmVhbSwgc3BsaXQgdGhlIG1hc3MgYmV0d2VlbiBpdHMgZW5kcG9pbnRzLlxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgYmVhbXNKU09OKSB7XG4gICAgICAgICAgICBjb25zdCBwMWZpeGVkID0gYi5wMSA8IDA7XG4gICAgICAgICAgICBjb25zdCBwMmZpeGVkID0gYi5wMiA8IDA7XG4gICAgICAgICAgICBjb25zdCBwMSA9IHAxZml4ZWQgPyBmaXhlZFBpbnNKU09OW2IucDEgKyBmaXhlZFBpbnNKU09OLmxlbmd0aF0gOiBwYXJ0aWNsZXNbYi5wMV0uZDtcbiAgICAgICAgICAgIGNvbnN0IHAyID0gcDJmaXhlZCA/IGZpeGVkUGluc0pTT05bYi5wMiArIGZpeGVkUGluc0pTT04ubGVuZ3RoXSA6IHBhcnRpY2xlc1tiLnAyXS5kO1xuICAgICAgICAgICAgY29uc3QgZGVuc2l0eSA9IHRydXNzLm1hdGVyaWFsc1tiLm1dLmRlbnNpdHk7XG4gICAgICAgICAgICBjb25zdCBtID0gZGVuc2l0eSAqIGIudyAqIHBvaW50RGlzdGFuY2UocDEsIHAyKTtcbiAgICAgICAgICAgIGlmICghcDFmaXhlZCkge1xuICAgICAgICAgICAgICAgIHBhcnRpY2xlc1tiLnAxXS5tICs9IG0gKiAwLjU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXAyZml4ZWQpIHtcbiAgICAgICAgICAgICAgICBwYXJ0aWNsZXNbYi5wMl0ubSArPSBtICogMC41O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMucGFydGljbGVTaW0gPSBuZXcgUGFydGljbGVTaW0oXG4gICAgICAgICAgICBSdW5nZUt1dHRhNCxcbiAgICAgICAgICAgIHBhcnRpY2xlcyxcbiAgICAgICAgICAgIHNjZW5lLmcsXG4gICAgICAgICAgICAxLCAgLy8gRGFtcGluZywgVE9ETzogcHVsbCBmcm9tIHNvbWV3aGVyZS5cbiAgICAgICAgICAgIChfdDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIG06IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSA9PiB7XG4gICAgICAgICAgICAgICAgcGluVGVycmFpbkNvbGxpc2lvbih0aGlzLnRlcnJhaW4sIHksIGR5ZHQpO1xuICAgICAgICAgICAgICAgIGRpc2NEZWNrQ29sbGlzaW9uKHRoaXMudGVycmFpbiwgdGhpcy5iZWFtcywgdGhpcy5kaXNjcywgdGhpcy5maXhlZFBpbnMsIHksIGR5ZHQpO1xuICAgICAgICAgICAgICAgIGJlYW1TdHJlc3ModGhpcy5iZWFtcywgdGhpcy5maXhlZFBpbnMsIHksIG0sIGR5ZHQpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBnZXQgdCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJ0aWNsZVNpbS50O1xuICAgIH1cbiAgICBuZXh0KGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnBhcnRpY2xlU2ltLm5leHQoaCk7XG4gICAgICAgIHRoaXMuYmVhbUJyZWFrKCk7XG4gICAgfVxuXG4gICAgc2F2ZSgpOiBUcnVzc1NpbVN0YXRlIHtcbiAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gdHJ1ZTtcbiAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIHRoaXMuYmVhbXMpIHtcbiAgICAgICAgICAgIE9iamVjdC5mcmVlemUoYmVhbSk7XG4gICAgICAgIH1cbiAgICAgICAgT2JqZWN0LmZyZWV6ZSh0aGlzLmJlYW1zKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBhcnRpY2xlU3RhdGU6IHRoaXMucGFydGljbGVTaW0uc2F2ZSgpLFxuICAgICAgICAgICAgYmVhbVN0YXRlOiB0aGlzLmJlYW1zLFxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXN0b3JlKHQ6IG51bWJlciwgczogVHJ1c3NTaW1TdGF0ZSk6IHZvaWQge1xuICAgICAgICB0aGlzLmJlYW1zID0gcy5iZWFtU3RhdGU7XG4gICAgICAgIHRoaXMucGFydGljbGVTaW0ucmVzdG9yZSh0LCBzLnBhcnRpY2xlU3RhdGUpO1xuICAgICAgICAvLyB0aGlzLmJlYW1zIHdhcyBvcmlnaW5hbGx5IHJldHVybmVkIGZyb20gc2F2ZSgpLCBzbyBkb24ndCBtdXRhdGUgaXQuXG4gICAgICAgIHRoaXMuYmVhbXNTYXZlZCA9IHRydWU7XG4gICAgfVxuICAgIHN0YXRlRXF1YWxzKHM6IFRydXNzU2ltU3RhdGUpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHMuYmVhbVN0YXRlLmxlbmd0aCAhPT0gdGhpcy5iZWFtcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdiZWFtU3RhdGUgbGVuZ3RoIG1pc21hdGNoJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmJlYW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiMSA9IHMuYmVhbVN0YXRlW2ldO1xuICAgICAgICAgICAgY29uc3QgYjIgPSB0aGlzLmJlYW1zW2ldO1xuICAgICAgICAgICAgaWYgKGIxLmRlY2sgIT09IGIyLmRlY2sgfHwgYjEubCAhPT0gYjIubCB8fCBiMS5wMSAhPT0gYjIucDEgfHwgYjEucDIgIT09IGIyLnAyIHx8IGIxLncgIT09IGIyLncpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgYmVhbVN0YXRlIG1pc21hdGNoIGF0IFske2l9XWApO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzaW0gPSB0aGlzLnBhcnRpY2xlU2ltO1xuICAgICAgICBjb25zdCBsZW5ndGggPSBzaW0ubGVuZ3RoKCk7XG4gICAgICAgIGlmIChzLnBhcnRpY2xlU3RhdGUubGVuZ3RoICE9PSBsZW5ndGggKiA1KSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygncGFydGljbGVTdGF0ZSBsZW5ndGggbWlzbWF0Y2gnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcyA9IHMucGFydGljbGVTdGF0ZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnBhcnRpY2xlU2ltLmxlbmd0aCgpOyBpICsrKSB7XG4gICAgICAgICAgICBpZiAoc2ltLmdldER4KGkpICE9PSBwc1tpICogNF1cbiAgICAgICAgICAgICAgICAgICAgfHwgc2ltLmdldER5KGkpICE9PSBwc1tpICogNCArIDFdXG4gICAgICAgICAgICAgICAgICAgIHx8IHNpbS5nZXRWeChpKSAhPT0gcHNbaSAqIDQgKyAyXVxuICAgICAgICAgICAgICAgICAgICB8fCBzaW0uZ2V0VnkoaSkgIT09IHBzW2kgKiA0ICsgM11cbiAgICAgICAgICAgICAgICAgICAgfHwgc2ltLmdldE0oaSkgIT09IHBzW2xlbmd0aCAqIDQgKyBpXSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBwYXJ0aWNsZVN0YXRlIG1pc21hdGNoIGF0IFske2l9XWApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXNldEJlYW0oaTogbnVtYmVyLCBwMTogbnVtYmVyLCBwMjogbnVtYmVyLCBsOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc29sZS5sb2coYHJlc2V0QmVhbSAke2l9ICR7cDF9ICR7cDJ9ICR7bH0sIG9sZCAke3RoaXMuYmVhbXNbaV0ucDF9ICR7dGhpcy5iZWFtc1tpXS5wMn0gJHt0aGlzLmJlYW1zW2ldLmx9YCk7XG4gICAgICAgIGNvbnN0IGR4ID0gdGhpcy5nZXREeChwMikgLSB0aGlzLmdldER4KHAxKTtcbiAgICAgICAgY29uc3QgZHkgPSB0aGlzLmdldER5KHAyKSAtIHRoaXMuZ2V0RHkocDEpO1xuICAgICAgICBjb25zdCBhY3R1YWxsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgaWYgKGFjdHVhbGwgKiAxLjI1IDwgbCB8fCBhY3R1YWxsICogMC43NSA+IGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigncHJlLXN0cmVzc2VkIGJlYW0gdG9vIHN0cmVzc2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYmVhbXNTYXZlZCkge1xuICAgICAgICAgICAgdGhpcy5iZWFtcyA9IHRoaXMuYmVhbXMuc2xpY2UoKTtcbiAgICAgICAgICAgIHRoaXMuYmVhbXNTYXZlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJlYW0gPSB7IC4uLnRoaXMuYmVhbXNbaV0gfTtcbiAgICAgICAgYmVhbS5wMSA9IHAxO1xuICAgICAgICBiZWFtLnAyID0gcDI7XG4gICAgICAgIGJlYW0ubCA9IGw7XG4gICAgICAgIGJlYW0uYnJva2VuID0gdHJ1ZTtcbiAgICAgICAgT2JqZWN0LmZyZWV6ZShiZWFtKTtcbiAgICAgICAgdGhpcy5iZWFtc1tpXSA9IGJlYW07XG4gICAgfVxuXG4gICAgYWRkQmVhbShwMTogbnVtYmVyLCBwMjogbnVtYmVyLCBtOiBNYXRlcmlhbCwgdzogbnVtYmVyLCBsOiBudW1iZXIsIGRlY2s6IGJvb2xlYW4pOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5iZWFtc1NhdmVkKSB7XG4gICAgICAgICAgICB0aGlzLmJlYW1zID0gdGhpcy5iZWFtcy5zbGljZSgpO1xuICAgICAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZHggPSB0aGlzLmdldER4KHAyKSAtIHRoaXMuZ2V0RHgocDEpO1xuICAgICAgICBjb25zdCBkeSA9IHRoaXMuZ2V0RHkocDIpIC0gdGhpcy5nZXREeShwMSk7XG4gICAgICAgIGNvbnN0IGFjdHVhbGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICBpZiAoYWN0dWFsbCAqIDEuMjUgPCBsIHx8IGFjdHVhbGwgKiAwLjc1ID4gbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwcmUtc3RyZXNzZWQgYmVhbSB0b28gc3RyZXNzZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBiZWFtOiBCZWFtID0geyBwMSwgcDIsIG0sIHcsIGwsIGRlY2ssIGhtYXBpOiAtMSwgYnJva2VuOiB0cnVlfTtcbiAgICAgICAgT2JqZWN0LmZyZWV6ZShiZWFtKTtcbiAgICAgICAgY29uc3QgaSA9IHRoaXMuYmVhbXMubGVuZ3RoO1xuICAgICAgICBjb25zb2xlLmxvZyhgYWRkQmVhbSAke2l9ICR7cDF9ICR7cDJ9ICR7d30gJHtsfSAke2RlY2t9YCk7XG4gICAgICAgIHRoaXMuYmVhbXNbaV0gPSBiZWFtO1xuICAgICAgICByZXR1cm4gaTtcbiAgICB9XG5cbiAgICBnZXREeChpOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJ0aWNsZVNpbS5nZXREeChpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpeGVkUGluc1tpICogMiArIHRoaXMuZml4ZWRQaW5zLmxlbmd0aF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0RHkoaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFydGljbGVTaW0uZ2V0RHkoaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5maXhlZFBpbnNbaSAqIDIgKyAxICsgdGhpcy5maXhlZFBpbnMubGVuZ3RoXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXRWeChpOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJ0aWNsZVNpbS5nZXRWeChpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldFZ5KGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnRpY2xlU2ltLmdldFZ5KGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGJlYW1CcmVhaygpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmJlYW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiZWFtID0gdGhpcy5iZWFtc1tpXTtcbiAgICAgICAgICAgIGlmIChiZWFtLmJyb2tlbikge1xuICAgICAgICAgICAgICAgIC8vIEJlYW0gaGFzIGFscmVhZHkgYmVlbiBicm9rZW4uXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBtYXRlcmlhbCA9IGJlYW0ubTtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGlmIChwMSA8IDAgJiYgcDIgPCAwKSB7XG4gICAgICAgICAgICAgICAgLy8gQm90aCBlbmRzIGFyZSBub3QgbW92ZWFibGUuXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB4MSA9IHRoaXMuZ2V0RHgocDEpO1xuICAgICAgICAgICAgY29uc3QgeDIgPSB0aGlzLmdldER4KHAyKTtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0geDIgLSB4MTtcbiAgICAgICAgICAgIGNvbnN0IHkxID0gdGhpcy5nZXREeShwMSk7XG4gICAgICAgICAgICBjb25zdCB5MiA9IHRoaXMuZ2V0RHkocDIpO1xuICAgICAgICAgICAgY29uc3QgZHkgPSB5MiAtIHkxO1xuICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgICAgICBpZiAobCA+IGJlYW0ubCAqIG1hdGVyaWFsLnRlbnNpb25ZaWVsZCkge1xuICAgICAgICAgICAgICAgIC8vIEJyZWFrIHRoZSBiZWFtIGF0IHAxLlxuICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gdGhpcy5nZXRWeChwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdnkgPSB0aGlzLmdldFZ5KHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXNzID0gYmVhbS5sICogYmVhbS53ICogYmVhbS5tLmRlbnNpdHkgKiAwLjU7XG4gICAgICAgICAgICAgICAgaWYgKHAxID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcnRpY2xlU2ltLnJlc2V0KHAxLCB0aGlzLnBhcnRpY2xlU2ltLmdldE0ocDEpIC0gbWFzcywgeDEsIHkxLCB2eCwgdnkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnJlc2V0QmVhbShpLCB0aGlzLnBhcnRpY2xlU2ltLmFkZChtYXNzLCB4MSwgeTEsIHZ4LCB2eSksIGJlYW0ucDIsIGwpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChsIDwgYmVhbS5sICogbWF0ZXJpYWwuYnVja2xlWWllbGQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgYnVja2xlICR7aX1gKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXNzID0gYmVhbS5sICogYmVhbS53ICogYmVhbS5tLmRlbnNpdHk7XG4gICAgICAgICAgICAgICAgY29uc3QgdngxID0gdGhpcy5nZXRWeChwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdnkxID0gdGhpcy5nZXRWeShwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdngyID0gdGhpcy5nZXRWeChwMik7XG4gICAgICAgICAgICAgICAgY29uc3QgdnkyID0gdGhpcy5nZXRWeShwMik7XG4gICAgICAgICAgICAgICAgLy8gQnVja2xpbmcgcG9pbnQgaXMgdGhlIG1pZHBvaW50IGRpc3BsYWNlZCBieSBhIGJpdC5cbiAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGFjZSA9IChiZWFtLmwgLSBsKSAvIGJlYW0ubDtcbiAgICAgICAgICAgICAgICBjb25zdCBweCA9ICh4MSArIHgyKSAqIDAuNSArIGR5ICogZGlzcGxhY2U7XG4gICAgICAgICAgICAgICAgY29uc3QgcHkgPSAoeTEgKyB5MikgKiAwLjUgLSBkeCAqIGRpc3BsYWNlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsID0gTWF0aC5zcXJ0KE1hdGgucG93KHB4IC0geDEsIDIpICsgTWF0aC5wb3cocHkgLSB5MSwgMikpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLnBhcnRpY2xlU2ltLmFkZChcbiAgICAgICAgICAgICAgICAgICAgbWFzcyAqIDAuNSxcbiAgICAgICAgICAgICAgICAgICAgcHgsIHB5LFxuICAgICAgICAgICAgICAgICAgICAodngxICsgdngyKSAqIDAuNSwgKHZ5MSArIHZ5MikgKiAwLjUsICAgLy8gVE9ETzogYWRkIHNvbWUgbXVsdGlwbGUgb2YgKGR5LCAtZHgpICogKGJlYW0ubCAtIGwpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAocDEgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcnRpY2xlU2ltLnJlc2V0KHAxLCB0aGlzLnBhcnRpY2xlU2ltLmdldE0ocDEpIC0gbWFzcyAqIC0wLjI1LCB4MSwgeTEsIHZ4MSwgdnkxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHAyID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXJ0aWNsZVNpbS5yZXNldChwMiwgdGhpcy5wYXJ0aWNsZVNpbS5nZXRNKHAyKSAtIG1hc3MgKiAtMC4yNSwgeDIsIHkyLCB2eDIsIHZ5Mik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRCZWFtKGksIHAxLCBwLCBwbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRCZWFtKHAsIHAyLCBiZWFtLm0sIGJlYW0udywgcGwsIGJlYW0uZGVjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKTogdm9pZCB7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdGhpcy5iZWFtcykge1xuICAgICAgICAgICAgY29uc3QgeDEgPSB0aGlzLmdldER4KGIucDEpO1xuICAgICAgICAgICAgY29uc3QgeTEgPSB0aGlzLmdldER5KGIucDEpO1xuICAgICAgICAgICAgY29uc3QgeDIgPSB0aGlzLmdldER4KGIucDIpO1xuICAgICAgICAgICAgY29uc3QgeTIgPSB0aGlzLmdldER5KGIucDIpO1xuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IGIudztcbiAgICAgICAgICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gYi5tLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4Lm1vdmVUbyh4MSwgeTEpO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyh4MiwgeTIpO1xuICAgICAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICAgICAgaWYgKGIuZGVjaykge1xuICAgICAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYnJvd25cIjsgIC8vIFRPRE86IGRlY2sgc3R5bGVcbiAgICAgICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYi53ICogMC43NTtcbiAgICAgICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICAgICAgY3R4Lm1vdmVUbyh4MSwgeTEpO1xuICAgICAgICAgICAgICAgIGN0eC5saW5lVG8oeDIsIHkyKTtcbiAgICAgICAgICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IGQgb2YgdGhpcy5kaXNjcykge1xuICAgICAgICAgICAgY29uc3QgZHggPSB0aGlzLnBhcnRpY2xlU2ltLmdldER4KGQucCk7XG4gICAgICAgICAgICBjb25zdCBkeSA9IHRoaXMucGFydGljbGVTaW0uZ2V0RHkoZC5wKTtcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSBkLm0uc3R5bGU7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHguZWxsaXBzZShkeCwgZHksIGQuciwgZC5yLCAwLCAwLCAyICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjdHguZmlsbCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcbiJdfQ==