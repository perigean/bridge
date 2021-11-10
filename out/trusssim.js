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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3NzaW0uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHJ1c3NzaW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFDSCxpQkFBaUIsSUFBSSx5QkFBeUIsRUFDOUMsVUFBVSxJQUFJLGtCQUFrQixFQUNoQyxLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixLQUFLLElBQUksYUFBYSxFQUN0QixTQUFTLEVBRVQsV0FBVyxHQUNkLE1BQU0sa0JBQWtCLENBQUM7QUFDMUIsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMzQyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ3ZDLE9BQU8sRUFBYSxNQUFNLElBQUksVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUEyQ2pFLHVGQUF1RjtBQUV2RixTQUFTLEtBQUssQ0FBQyxDQUFlLEVBQUUsS0FBbUIsRUFBRSxDQUFTO0lBQzFELElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNSLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztLQUNuQjtTQUFNO1FBQ0gsT0FBTyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDdEM7QUFDTCxDQUFDO0FBRUQsU0FBUyxLQUFLLENBQUMsQ0FBZSxFQUFFLEtBQW1CLEVBQUUsQ0FBUztJQUMxRCxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDUixPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ3ZCO1NBQU07UUFDSCxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDMUM7QUFDTCxDQUFD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SUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0IscURBQXFEO2dCQUNyRCxNQUFNLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDdkMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxRQUFRLENBQUM7Z0JBQzNDLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsUUFBUSxDQUFDO2dCQUMzQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQzFCLElBQUksR0FBRyxHQUFHLEVBQ1YsRUFBRSxFQUFFLEVBQUUsRUFDTixDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUN2QyxDQUFDO2dCQUNGLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRTtvQkFDVCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2lCQUMxRjtnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUU7b0JBQ1QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztpQkFDMUY7Z0JBQ0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3REO1NBQ0o7SUFDTCxDQUFDO0lBRUQsSUFBSSxDQUFDLEdBQTZCO1FBRTlCLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUN4QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QixHQUFHLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsR0FBRyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7WUFDdEIsR0FBRyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztZQUM1QixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbkIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbkIsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFO2dCQUNSLEdBQUcsQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDLENBQUUsbUJBQW1CO2dCQUMvQyxHQUFHLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUMzQixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNuQixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDbkIsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO2FBQ2hCO1NBQ0o7UUFFRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDeEIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxHQUFHLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQzFCLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNqRCxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDZDtJQUNMLENBQUM7Q0FDSjtBQUFBLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAyMSBDaGFybGVzIER1ZWNrXG5cbmltcG9ydCB7XG4gICAgYXBwbHlBY2NlbGVyYXRpb24gYXMgcGFydGljbGVBcHBseUFjY2VsZXJhdGlvbixcbiAgICBhcHBseUZvcmNlIGFzIHBhcnRpY2xlQXBwbHlGb3JjZSxcbiAgICBnZXREeCBhcyBwYXJ0aWNsZUdldER4LFxuICAgIGdldER5IGFzIHBhcnRpY2xlR2V0RHksXG4gICAgZ2V0VnggYXMgcGFydGljbGVHZXRWeCxcbiAgICBnZXRWeSBhcyBwYXJ0aWNsZUdldFZ5LFxuICAgIGdldExlbmd0aCxcbiAgICBQYXJ0aWNsZUluaXQsXG4gICAgUGFydGljbGVTaW0sXG59IGZyb20gXCIuL3BhcnRpY2xlc2ltLmpzXCI7XG5pbXBvcnQgeyBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4vcG9pbnQuanNcIjtcbmltcG9ydCB7IFJ1bmdlS3V0dGE0IH0gZnJvbSBcIi4vcms0LmpzXCI7XG5pbXBvcnQgeyBTY2VuZUpTT04sIGdldFBpbiBhcyBqc29uR2V0UGluIH0gZnJvbSBcIi4vdHJ1c3NKU09OLmpzXCI7XG5cbi8vIFRoZSBmb2xsb3dpbmcgdHlwZXMgc3RvcmUgdGhlIFNjZW5lSlNPTiBpbiBhIHdheSB0aGF0IGlzIGVhc3kgdG8gc2ltdWxhdGUuXG5cbnR5cGUgTWF0ZXJpYWwgPSB7XG4gICAgZGVuc2l0eTogbnVtYmVyO1xuICAgIEU6IG51bWJlcjsgIC8vIFlvdW5nJ3MgbW9kdWx1cyBpbiBQYS5cbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgdGVuc2lvbllpZWxkOiBudW1iZXIsXG4gICAgYnVja2xlWWllbGQ6IG51bWJlcixcbn07XG5cbnR5cGUgQmVhbSA9IHtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogTWF0ZXJpYWw7XG4gICAgdzogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBkZWNrOiBib29sZWFuO1xuICAgIGhtYXBpOiBudW1iZXI7IC8vIEluZGV4IGludG8gVGVycmFpbi5obWFwIG9mIGxlZnRtb3N0IHBvaW50IG9mIHRoaXMgYmVhbS5cbiAgICBicm9rZW46IGJvb2xlYW47XG59O1xuXG50eXBlIERpc2MgPSB7XG4gICAgcDogbnVtYmVyO1xuICAgIHI6IG51bWJlcjtcbiAgICB2OiBudW1iZXI7XG4gICAgbTogTWF0ZXJpYWw7XG59O1xuXG50eXBlIFRlcnJhaW4gPSB7XG4gICAgaG1hcDogQXJyYXk8e1xuICAgICAgICBkZXB0aDogbnVtYmVyO1xuICAgICAgICBueDogbnVtYmVyOyAvLyBPdXR3YXJkIChkaXJlY3Rpb24gb2YgYm91bmNlKSBub3JtYWwgdW5pdCB2ZWN0b3IuXG4gICAgICAgIG55OiBudW1iZXI7XG4gICAgICAgIGRlY2tzOiBBcnJheTxCZWFtPjsgICAvLyBVcGRhdGVkIGV2ZXJ5IGZyYW1lLCBhbGwgZGVja3MgYWJvdmUgdGhpcyBzZWdtZW50LlxuICAgICAgICBkZWNrQ291bnQ6IG51bWJlcjsgIC8vIE51bWJlciBvZiBpbmRpY2VzIGluIGRlY2tzIGJlaW5nIHVzZWQuXG4gICAgfT47XG4gICAgcGl0Y2g6IG51bWJlcjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xufTtcblxuLy8gVE9ETzogZm9yIGJ1Y2tsaW5nLCBtYWtlIHRoZSB0d28gbmV3IGJlYW1zIHNob3J0ZXIgc28gdGhleSBkb24ndCBpbW1lZGlldGFseSBidWNrbGUuXG5cbmZ1bmN0aW9uIGdldER4KHk6IEZsb2F0MzJBcnJheSwgZml4ZWQ6IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgIHJldHVybiB5W2kgKiA0XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZml4ZWRbaSAqIDIgKyBmaXhlZC5sZW5ndGhdO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0RHkoeTogRmxvYXQzMkFycmF5LCBmaXhlZDogRmxvYXQzMkFycmF5LCBpOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChpID49IDApIHtcbiAgICAgICAgcmV0dXJuIHlbaSAqIDQgKyAxXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZml4ZWRbaSAqIDIgKyAxICsgZml4ZWQubGVuZ3RoXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFZ4KHk6IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgIHJldHVybiB5W2kgKiA0ICsgMl07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRWeSh5OiBGbG9hdDMyQXJyYXksIGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKGkgPj0gMCkge1xuICAgICAgICByZXR1cm4geVtpICogNCArIDNdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXBwbHlBY2NlbGVyYXRpb24oZHlkdDogRmxvYXQzMkFycmF5LCBpOiBudW1iZXIsIGF4OiBudW1iZXIsIGF5OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoaSA8IDApIHJldHVybjtcbiAgICBwYXJ0aWNsZUFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIGksIGF4LCBheSk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5Rm9yY2UoZHlkdDogRmxvYXQzMkFycmF5LCBtOiBGbG9hdDMyQXJyYXksIGk6IG51bWJlciwgZng6IG51bWJlciwgZnk6IG51bWJlcik6IHZvaWQge1xuICAgIGlmIChpIDwgMCkgcmV0dXJuO1xuICAgIHBhcnRpY2xlQXBwbHlGb3JjZShkeWR0LCBtLCBpLCBmeCwgZnkpO1xufVxuXG5mdW5jdGlvbiBwaW5UZXJyYWluQ29sbGlzaW9uKHQ6IFRlcnJhaW4sIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgY29uc3QgaG1hcCA9IHQuaG1hcDtcbiAgICBjb25zdCBwaXRjaCA9IHQucGl0Y2g7XG4gICAgY29uc3QgbGVuZ3RoID0gZ2V0TGVuZ3RoKHkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZHggPSBwYXJ0aWNsZUdldER4KHksIGkpO1xuICAgICAgICBjb25zdCBkeSA9IHBhcnRpY2xlR2V0RHkoeSwgaSk7XG4gICAgICAgIGxldCBib3VuY2VBID0gMTAwMDAuMDsgLy8gQWNjZWxlcmF0aW9uIHBlciBtZXRyZSBvZiBkZXB0aCB1bmRlciB0ZXJyYWluLlxuICAgICAgICBsZXQgbng7IC8vIFRlcnJhaW4gdW5pdCBub3JtYWwgKGRpcmVjdGlvbiBvZiBhY2NlbGVyYXRpb24pLlxuICAgICAgICBsZXQgbnk7XG4gICAgICAgIGlmIChkeCA8IDAuMCkge1xuICAgICAgICAgICAgbnggPSAwLjA7XG4gICAgICAgICAgICBueSA9IC0xLjA7XG4gICAgICAgICAgICBib3VuY2VBICo9IGR5IC0gaG1hcFswXS5kZXB0aDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHRpID0gTWF0aC5taW4oaG1hcC5sZW5ndGggLSAxLCBNYXRoLmZsb29yKGR4IC8gcGl0Y2gpKTtcbiAgICAgICAgICAgIG54ID0gaG1hcFt0aV0ubng7XG4gICAgICAgICAgICBueSA9IGhtYXBbdGldLm55O1xuICAgICAgICAgICAgLy8gRGlzdGFuY2UgYmVsb3cgdGVycmFpbiBpcyBub3JtYWwgZG90IHZlY3RvciBmcm9tIHRlcnJhaW4gdG8gcG9pbnQuXG4gICAgICAgICAgICBib3VuY2VBICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uZGVwdGgpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYm91bmNlQSA8PSAwLjApIHtcbiAgICAgICAgICAgIC8vIFdlIGFyZSBub3QgYm91bmNpbmcuXG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBwYXJ0aWNsZUFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIGksIG54ICogYm91bmNlQSwgbnkgKiBib3VuY2VBKTtcblxuICAgICAgICAvLyBGcmljdGlvbi5cbiAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIGluIHByb3BvcnRpb24gdG8gYXQsIGluIGRpcmVjdGlvbiBvcHBvc2l0ZSBvZiB0YW5nZW50IHByb2plY3RlZCB2ZWxvY2l0eS5cbiAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgIGNvbnN0IHZ4ID0gcGFydGljbGVHZXRWeCh5LCBpKTtcbiAgICAgICAgY29uc3QgdnkgPSBwYXJ0aWNsZUdldFZ5KHksIGkpO1xuICAgICAgICBjb25zdCB0diA9IHZ4ICogdHggKyB2eSAqIHR5O1xuICAgICAgICBsZXQgZnJpY3Rpb25BID0gdC5mcmljdGlvbiAqIGJvdW5jZUEgKiAodHYgPiAwID8gLTEgOiAxKTtcbiAgICAgICAgcGFydGljbGVBcHBseUFjY2VsZXJhdGlvbihkeWR0LCBpLCB0eCAqIGZyaWN0aW9uQSwgdHkgKiBmcmljdGlvbkEpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZGlzY0RlY2tDb2xsaXNpb24odDogVGVycmFpbiwgYmVhbXM6IEFycmF5PEJlYW0+LCBkaXNjczogQXJyYXk8RGlzYz4sIGZpeGVkOiBGbG9hdDMyQXJyYXksIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgLy8gc2V0IHVwIGhtYXAuZGVja3MgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZVxuICAgIGNvbnN0IGhtYXAgPSB0LmhtYXA7XG4gICAgY29uc3QgaG1hcGk6IE1hcDxCZWFtLCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IHBpdGNoID0gdC5waXRjaDtcbiAgICBmb3IgKGNvbnN0IGNvbCBvZiBobWFwKSB7XG4gICAgICAgIGNvbC5kZWNrQ291bnQgPSAwO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGIgb2YgYmVhbXMpIHtcbiAgICAgICAgaWYgKGIuZGVjaykge1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiLnAxO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBiLnAyO1xuICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKGdldER4KHksIGZpeGVkLCBwMSkgLyBwaXRjaCk7XG4gICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoZ2V0RHgoeSwgZml4ZWQsIHAyKSAvIHBpdGNoKTtcbiAgICAgICAgICAgIGNvbnN0IGJlZ2luID0gTWF0aC5tYXgoTWF0aC5taW4oaTEsIGkyKSwgMCk7XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihNYXRoLm1heChpMSwgaTIpLCBobWFwLmxlbmd0aCAtIDEpO1xuICAgICAgICAgICAgaG1hcGkuc2V0KGIsIGJlZ2luKTtcbiAgICAgICAgICAgIC8vYi5obWFwaSA9IGJlZ2luO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sID0gaG1hcFtpXTtcbiAgICAgICAgICAgICAgICBjb2wuZGVja3NbY29sLmRlY2tDb3VudF0gPSBiO1xuICAgICAgICAgICAgICAgIGNvbC5kZWNrQ291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgY29uc3QgcCA9IGRpc2MucDtcbiAgICAgICAgY29uc3QgciA9IGRpc2MucjtcbiAgICAgICAgY29uc3QgZHggPSBnZXREeCh5LCBmaXhlZCwgcCk7XG4gICAgICAgIC8vIExvb3AgdGhyb3VnaCBhbGwgaG1hcCBidWNrZXRzIHRoYXQgZGlzYyBvdmVybGFwcy5cbiAgICAgICAgY29uc3QgaTEgPSBNYXRoLm1heChNYXRoLmZsb29yKChkeCAtIHIpIC8gcGl0Y2gpLCAwKTtcbiAgICAgICAgY29uc3QgaTIgPSBNYXRoLm1pbihNYXRoLmZsb29yKChkeCArIHIpIC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpO1xuICAgICAgICBmb3IgKGxldCBpID0gaTE7IGkgPD0gaTI7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZGVja3MgPSBobWFwW2ldLmRlY2tzO1xuICAgICAgICAgICAgY29uc3QgZGVja0NvdW50ID0gaG1hcFtpXS5kZWNrQ291bnQ7XG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRlY2tDb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVjayA9IGRlY2tzW2pdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tobWFwaSA9IGhtYXBpLmdldChkZWNrKTtcbiAgICAgICAgICAgICAgICBpZiAoZGVja2htYXBpID09PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcignZGVjayBub3QgZm91bmQgaW4gaG1hcGknKTtcbiAgICAgICAgICAgICAgICBpZiAoaSAhPT0gTWF0aC5tYXgoaTEsIGRlY2tobWFwaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gT25seSBjb21wdXRlIGNvbGxpc2lvbiBpZiB0aGUgYnVja2V0IHdlIGFyZSBpbiBpcyB0aGUgbGVmdG1vc3RcbiAgICAgICAgICAgICAgICAgICAgLy8gb25lIHRoYXQgY29udGFpbnMgYm90aCB0aGUgZGVjayBhbmQgdGhlIGRpc2MuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwMSA9IGRlY2sucDE7XG4gICAgICAgICAgICAgICAgY29uc3QgcDIgPSBkZWNrLnAyO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0RHkoeSwgZml4ZWQsIHApO1xuICAgICAgICAgICAgICAgIGNvbnN0IHgxID0gZ2V0RHgoeSwgZml4ZWQsIHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB5MSA9IGdldER5KHksIGZpeGVkLCBwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgeDIgPSBnZXREeCh5LCBmaXhlZCwgcDIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHkyID0gZ2V0RHkoeSwgZml4ZWQsIHAyKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBJcyBjb2xsaXNpb24gaGFwcGVuaW5nP1xuICAgICAgICAgICAgICAgIGNvbnN0IHN4ID0geDIgLSB4MTsgLy8gVmVjdG9yIHRvIGVuZCBvZiBkZWNrIChmcm9tIHN0YXJ0KVxuICAgICAgICAgICAgICAgIGNvbnN0IHN5ID0geTIgLSB5MTtcbiAgICAgICAgICAgICAgICBjb25zdCBjeCA9IGR4IC0geDE7IC8vIFZlY3RvciB0byBjZW50cmUgb2YgZGlzYyAoZnJvbSBzdGFydCBvZiBkZWNrKVxuICAgICAgICAgICAgICAgIGNvbnN0IGN5ID0gZHkgLSB5MTtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gc3ggKiBzeCArIHN5ICogc3k7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IC0yLjAgKiAoY3ggKiBzeCArIGN5ICogc3kpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGMgPSBjeCAqIGN4ICsgY3kgKiBjeSAtIHIgKiByO1xuICAgICAgICAgICAgICAgIGNvbnN0IEQgPSBiICogYiAtIDQuMCAqIGEgKiBjO1xuICAgICAgICAgICAgICAgIGlmIChEIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgICAvLyBObyBSZWFsIHNvbHV0aW9ucyB0byBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3REID0gTWF0aC5zcXJ0KEQpO1xuICAgICAgICAgICAgICAgIGxldCB0ID0gLWIgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgbGV0IHQxID0gKC1iIC0gcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgIGxldCB0MiA9ICgtYiArIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICBpZiAoKHQxIDw9IDAuMCAmJiB0MiA8PSAwLjApIHx8ICh0MSA+PSAxLjAgJiYgdDIgPj0gMC4wKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgICAvLyBJbnRlcnNlY3Rpb25zIGFyZSBib3RoIGJlZm9yZSBvciBhZnRlciBkZWNrLlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ID0gTWF0aC5tYXgoTWF0aC5taW4odCwgMS4wKSwgMC4wKTtcbiAgICAgICAgICAgICAgICB0MSA9IE1hdGgubWF4KHQxLCAwLjApO1xuICAgICAgICAgICAgICAgIHQyID0gTWF0aC5taW4odDIsIDEuMCk7XG5cbiAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGNvbGxpc2lvbiBhY2NlbGVyYXRpb24uXG4gICAgICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGlzIHByb3BvcnRpb25hbCB0byBhcmVhICdzaGFkb3dlZCcgaW4gdGhlIGRpc2MgYnkgdGhlIGludGVyc2VjdGluZyBkZWNrLlxuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgc28gdGhhdCBhcyBhIGRpc2MgbW92ZXMgYmV0d2VlbiB0d28gZGVjayBzZWdtZW50cywgdGhlIGFjY2VsZXJhdGlvbiByZW1haW5zIGNvbnN0YW50LlxuICAgICAgICAgICAgICAgIGNvbnN0IHQxeCA9ICgxIC0gdDEpICogeDEgKyB0MSAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MSBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgY29uc3QgdDF5ID0gKDEgLSB0MSkgKiB5MSArIHQxICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICBjb25zdCB0MnggPSAoMSAtIHQyKSAqIHgxICsgdDIgKiB4MiAtIGR4OyAgIC8vIENpcmNsZSBjZW50cmUgLT4gdDIgaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgIGNvbnN0IHQyeSA9ICgxIC0gdDIpICogeTEgKyB0MiAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGEgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHQxeSwgdDF4KSAtIE1hdGguYXRhbjIodDJ5LCB0MngpKSAlIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgY29uc3QgYXJlYSA9IDAuNSAqIHIgKiByICogdGEgLSAwLjUgKiBNYXRoLmFicyh0MXggKiB0MnkgLSB0MXkgKiB0MngpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjYyA9IDEwMDAwLjAgKiBhcmVhIC8gcjtcbiAgICAgICAgICAgICAgICBsZXQgbnggPSBjeCAtIHN4ICogdDtcbiAgICAgICAgICAgICAgICBsZXQgbnkgPSBjeSAtIHN5ICogdDtcbiAgICAgICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KG54ICogbnggKyBueSAqIG55KTtcbiAgICAgICAgICAgICAgICBueCAvPSBsO1xuICAgICAgICAgICAgICAgIG55IC89IGw7XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gdG8gdGhlIGRpc2MuXG4gICAgICAgICAgICAgICAgYXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgcCwgbnggKiBhY2MsIG55ICogYWNjKTtcblxuICAgICAgICAgICAgICAgIC8vIGFwcGx5IGFjY2xlcmF0aW9uIGRpc3RyaWJ1dGVkIHRvIHBpbnNcbiAgICAgICAgICAgICAgICBhcHBseUFjY2VsZXJhdGlvbihkeWR0LCBwMSwgLW54ICogYWNjICogKDEgLSB0KSwgLW55ICogYWNjICogKDEgLSB0KSk7XG4gICAgICAgICAgICAgICAgYXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgcDIsIC1ueCAqIGFjYyAqIHQsIC1ueSAqIGFjYyAqIHQpO1xuXG4gICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBmcmljdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBHZXQgcmVsYXRpdmUgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgY29uc3QgdnggPSBnZXRWeCh5LCBwKSAtICgxLjAgLSB0KSAqIGdldFZ4KHksIHAxKSAtIHQgKiBnZXRWeCh5LCBwMik7XG4gICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXRWeSh5LCBwKSAtICgxLjAgLSB0KSAqIGdldFZ5KHksIHAxKSAtIHQgKiBnZXRWeSh5LCBwMik7XG4gICAgICAgICAgICAgICAgLy9jb25zdCB2biA9IHZ4ICogbnggKyB2eSAqIG55O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgY29uc3QgdnQgPSB2eCAqIHR4ICsgdnkgKiB0eSAtIGRpc2MudjtcbiAgICAgICAgICAgICAgICAvLyBUb3RhbGx5IHVuc2NpZW50aWZpYyB3YXkgdG8gY29tcHV0ZSBmcmljdGlvbiBmcm9tIGFyYml0cmFyeSBjb25zdGFudHMuXG4gICAgICAgICAgICAgICAgY29uc3QgZnJpY3Rpb24gPSBNYXRoLnNxcnQoZGlzYy5tLmZyaWN0aW9uICogZGVjay5tLmZyaWN0aW9uKTtcbiAgICAgICAgICAgICAgICBjb25zdCBhZiA9IGFjYyAqIGZyaWN0aW9uICogKHZ0IDw9IDAuMCA/IDEuMCA6IC0xLjApO1xuICAgICAgICAgICAgICAgIGFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIHAsIHR4ICogYWYsIHR5ICogYWYpO1xuICAgICAgICAgICAgICAgIGFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQsIHAxLCAtdHggKiBhZiAqICgxIC0gdCksIC10eSAqIGFmICogKDEgLSB0KSk7XG4gICAgICAgICAgICAgICAgYXBwbHlBY2NlbGVyYXRpb24oZHlkdCwgcDIsIC10eCAqIGFmICogdCwgLXR5ICogYWYgKiB0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gYmVhbVN0cmVzcyhiZWFtczogQXJyYXk8QmVhbT4sIGZpeGVkOiBGbG9hdDMyQXJyYXksIHk6IEZsb2F0MzJBcnJheSwgbTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgIGlmIChwMSA8IDAgJiYgcDIgPCAwKSB7XG4gICAgICAgICAgICAvLyBCb3RoIGVuZHMgYXJlIG5vdCBtb3ZlYWJsZS5cbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGR4ID0gZ2V0RHgoeSwgZml4ZWQsIHAyKSAtIGdldER4KHksIGZpeGVkLCBwMSk7XG4gICAgICAgIGNvbnN0IGR5ID0gZ2V0RHkoeSwgZml4ZWQsIHAyKSAtIGdldER5KHksIGZpeGVkLCBwMSk7XG4gICAgICAgIGxldCBsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgaWYgKGwgPCBiZWFtLmwgKiBiZWFtLm0uYnVja2xlWWllbGQpIHtcbiAgICAgICAgICAgIC8vdGhyb3cgbmV3IEVycm9yKCdzcXVpc2hlZCBiZWFtJyk7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdzcXVpc2hlZCBiZWFtJyk7XG4gICAgICAgICAgICBsID0gYmVhbS5sICogYmVhbS5tLmJ1Y2tsZVlpZWxkO1xuICAgICAgICB9IGVsc2UgaWYgKGwgPiBiZWFtLmwgKiBiZWFtLm0udGVuc2lvbllpZWxkKSB7XG4gICAgICAgICAgICAvL3Rocm93IG5ldyBFcnJvcignc3RyZWNoZWQgYmVhbScpO1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnc3RyZXRjaGVkIGJlYW0nKTtcbiAgICAgICAgICAgIGwgPSBiZWFtLmwgKiBiZWFtLm0udGVuc2lvbllpZWxkO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRPRE86IENhcCBjb21wcmVzc2lvbiBzdHJlc3MuIFdlIGdldCB1bnN0YWJsZSByZXN1bHRzIGZyb20gdmVyeSBoaWdoIGZvcmNlcyBpZiB0aGUgYmVhbSBpcyBzaHJ1bmsgdG9vIHNob3J0IGR1ZSB0byBoIGJlaW5nIHRvbyBsb25nLlxuICAgICAgICBjb25zdCBrID0gYmVhbS5tLkUgKiBiZWFtLncgLyBiZWFtLmw7XG4gICAgICAgIGNvbnN0IHNwcmluZ0YgPSAobCAtIGJlYW0ubCkgKiBrO1xuICAgICAgICBjb25zdCB1eCA9IGR4IC8gbDsgICAgICAvLyBVbml0IHZlY3RvciBpbiBkaXJlY3Rpbm8gb2YgYmVhbTtcbiAgICAgICAgY29uc3QgdXkgPSBkeSAvIGw7XG5cbiAgICAgICAgLy8gQmVhbSBzdHJlc3MgZm9yY2UuXG4gICAgICAgIGFwcGx5Rm9yY2UoZHlkdCwgbSwgcDEsIHV4ICogc3ByaW5nRiwgdXkgKiBzcHJpbmdGKTtcbiAgICAgICAgYXBwbHlGb3JjZShkeWR0LCBtLCBwMiwgLXV4ICogc3ByaW5nRiwgLXV5ICogc3ByaW5nRik7XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBUcnVzc1NpbVN0YXRlID0ge1xuICAgIHBhcnRpY2xlU3RhdGU6IEZsb2F0MzJBcnJheTtcbiAgICBiZWFtU3RhdGU6IEFycmF5PEJlYW0+O1xufTtcblxuLy8gVE9ETzogaW1wbGVtZW50IE9ERU1ldGhvZD8gTWlnaHQgbWFrZSB0aGluZ3MgbXVjaCBzaW1wbGVyIHRvIHBhc3Mgc3RhdGUgYXJvdW5kLlxuLy8gaGFyZCB0byBkZWNvdXBsZSBPREUgUGxheWVyLi4uIE1pZ2h0IG5lZWQgdG8gbWFrZSBhIFRydXNzUGxheWVyLlxuZXhwb3J0IGNsYXNzIFRydXNzU2ltIHtcbiAgICBwcml2YXRlIHRlcnJhaW46IFRlcnJhaW47XG4gICAgcHJpdmF0ZSBmaXhlZFBpbnM6IEZsb2F0MzJBcnJheTtcbiAgICBwcml2YXRlIGJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBwcml2YXRlIGJlYW1zU2F2ZWQ6IGJvb2xlYW47ICAgIC8vIEhhcyB0aGlzLmJlYW1zIGJlZW4gcmV0dXJuZWQgZnJvbSBzYXZlKCk/IElmIHNvLCB3ZSdsbCBuZWVkIGEgbmV3IG9uZSBpZiB3ZSBtdXRhdGUuXG4gICAgcHJpdmF0ZSBkaXNjczogQXJyYXk8RGlzYz47XG4gICAgcHJpdmF0ZSBwYXJ0aWNsZVNpbTogUGFydGljbGVTaW07XG5cbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogU2NlbmVKU09OKSB7XG4gICAgICAgIGNvbnN0IHBpdGNoID0gc2NlbmUud2lkdGggLyAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpO1xuICAgICAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgICAgICB0aGlzLnRlcnJhaW4gPSB7XG4gICAgICAgICAgICBobWFwOiBzY2VuZS50ZXJyYWluLmhtYXAubWFwKCh2LCBpLCBobWFwKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG54ID0gMDtcbiAgICAgICAgICAgICAgICBsZXQgbnkgPSAtMTtcbiAgICAgICAgICAgICAgICBpZiAoaSArIDEgPCBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSB2O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgbnggPSBkeSAvIGw7XG4gICAgICAgICAgICAgICAgICAgIG55ID0gLXBpdGNoIC8gbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGg6IHYsXG4gICAgICAgICAgICAgICAgICAgIG54LCBueSxcbiAgICAgICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgcGl0Y2gsXG4gICAgICAgICAgICBmcmljdGlvbjogc2NlbmUudGVycmFpbi5mcmljdGlvbixcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbWF0ZXJpYWxzOiBBcnJheTxNYXRlcmlhbD4gPSB0cnVzcy5tYXRlcmlhbHMubWFwKHYgPT4gKHtcbiAgICAgICAgICAgIGRlbnNpdHk6IHYuZGVuc2l0eSxcbiAgICAgICAgICAgIEU6IHYuRSxcbiAgICAgICAgICAgIGZyaWN0aW9uOiB2LmZyaWN0aW9uLFxuICAgICAgICAgICAgc3R5bGU6IHYuc3R5bGUsXG4gICAgICAgICAgICB0ZW5zaW9uWWllbGQ6IHYudGVuc2lvbllpZWxkLFxuICAgICAgICAgICAgYnVja2xlWWllbGQ6IHYuYnVja2xlWWllbGQsXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc3QgZml4ZWRQaW5zSlNPTiA9IHRydXNzLmZpeGVkUGlucztcbiAgICAgICAgdGhpcy5maXhlZFBpbnMgPSBuZXcgRmxvYXQzMkFycmF5KGZpeGVkUGluc0pTT04ubGVuZ3RoICogMik7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZml4ZWRQaW5zSlNPTi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcCA9IGZpeGVkUGluc0pTT05baV07XG4gICAgICAgICAgICB0aGlzLmZpeGVkUGluc1tpKjIrMF0gPSBwWzBdO1xuICAgICAgICAgICAgdGhpcy5maXhlZFBpbnNbaSoyKzFdID0gcFsxXTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBiZWFtc0pTT04gPSBbLi4udHJ1c3MudHJhaW5CZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXTtcbiAgICAgICAgdGhpcy5iZWFtcyA9IGJlYW1zSlNPTi5tYXAodiA9PiAoe1xuICAgICAgICAgICAgcDE6IHYucDEsXG4gICAgICAgICAgICBwMjogdi5wMixcbiAgICAgICAgICAgIHc6IHYudyxcbiAgICAgICAgICAgIGw6IHYubCB8fCBwb2ludERpc3RhbmNlKGpzb25HZXRQaW4odHJ1c3MsIHYucDEpLCBqc29uR2V0UGluKHRydXNzLCB2LnAyKSksXG4gICAgICAgICAgICBtOiBtYXRlcmlhbHNbdi5tXSxcbiAgICAgICAgICAgIGRlY2s6IHYuZGVjayA9PT0gdHJ1ZSxcbiAgICAgICAgICAgIGhtYXBpOiAtMSwgIC8vIFdpbGwgYmUgdXBkYXRlZCBldmVyeSBmcmFtZSwgYmVmb3JlIGNvbXB1dGluZyB0ZXJyYWluIGNvbGxpc2lvbi5cbiAgICAgICAgICAgIGJyb2tlbjogZmFsc2UsXG4gICAgICAgIH0pKTtcbiAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5kaXNjcyA9IHRydXNzLmRpc2NzLm1hcCh2ID0+ICh7XG4gICAgICAgICAgICBwOiB2LnAsXG4gICAgICAgICAgICByOiB2LnIsXG4gICAgICAgICAgICB2OiB2LnYsXG4gICAgICAgICAgICBtOiBtYXRlcmlhbHNbdi5tXSxcbiAgICAgICAgfSkpO1xuICAgICAgICBjb25zdCBwYXJ0aWNsZXM6IFBhcnRpY2xlSW5pdFtdID0gWy4uLnRydXNzLnRyYWluUGlucywgLi4udHJ1c3MuZWRpdFBpbnNdLm1hcChkID0+ICh7XG4gICAgICAgICAgICBkLFxuICAgICAgICAgICAgbTogMCwgICAvLyBJbml0aWFsaXplZCBiZWxvdy5cbiAgICAgICAgfSkpO1xuICAgICAgICAvLyBGb3IgZWFjaCBiZWFtLCBzcGxpdCB0aGUgbWFzcyBiZXR3ZWVuIGl0cyBlbmRwb2ludHMuXG4gICAgICAgIGZvciAoY29uc3QgYiBvZiBiZWFtc0pTT04pIHtcbiAgICAgICAgICAgIGNvbnN0IHAxZml4ZWQgPSBiLnAxIDwgMDtcbiAgICAgICAgICAgIGNvbnN0IHAyZml4ZWQgPSBiLnAyIDwgMDtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gcDFmaXhlZCA/IGZpeGVkUGluc0pTT05bYi5wMSArIGZpeGVkUGluc0pTT04ubGVuZ3RoXSA6IHBhcnRpY2xlc1tiLnAxXS5kO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBwMmZpeGVkID8gZml4ZWRQaW5zSlNPTltiLnAyICsgZml4ZWRQaW5zSlNPTi5sZW5ndGhdIDogcGFydGljbGVzW2IucDJdLmQ7XG4gICAgICAgICAgICBjb25zdCBkZW5zaXR5ID0gdHJ1c3MubWF0ZXJpYWxzW2IubV0uZGVuc2l0eTtcbiAgICAgICAgICAgIGNvbnN0IG0gPSBkZW5zaXR5ICogYi53ICogcG9pbnREaXN0YW5jZShwMSwgcDIpO1xuICAgICAgICAgICAgaWYgKCFwMWZpeGVkKSB7XG4gICAgICAgICAgICAgICAgcGFydGljbGVzW2IucDFdLm0gKz0gbSAqIDAuNTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcDJmaXhlZCkge1xuICAgICAgICAgICAgICAgIHBhcnRpY2xlc1tiLnAyXS5tICs9IG0gKiAwLjU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wYXJ0aWNsZVNpbSA9IG5ldyBQYXJ0aWNsZVNpbShcbiAgICAgICAgICAgIFJ1bmdlS3V0dGE0LFxuICAgICAgICAgICAgcGFydGljbGVzLFxuICAgICAgICAgICAgc2NlbmUuZyxcbiAgICAgICAgICAgIDEsICAvLyBEYW1waW5nLCBUT0RPOiBwdWxsIGZyb20gc29tZXdoZXJlLlxuICAgICAgICAgICAgKF90OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgbTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpID0+IHtcbiAgICAgICAgICAgICAgICBwaW5UZXJyYWluQ29sbGlzaW9uKHRoaXMudGVycmFpbiwgeSwgZHlkdCk7XG4gICAgICAgICAgICAgICAgZGlzY0RlY2tDb2xsaXNpb24odGhpcy50ZXJyYWluLCB0aGlzLmJlYW1zLCB0aGlzLmRpc2NzLCB0aGlzLmZpeGVkUGlucywgeSwgZHlkdCk7XG4gICAgICAgICAgICAgICAgYmVhbVN0cmVzcyh0aGlzLmJlYW1zLCB0aGlzLmZpeGVkUGlucywgeSwgbSwgZHlkdCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICApO1xuICAgIH1cblxuICAgIGdldCB0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhcnRpY2xlU2ltLnQ7XG4gICAgfVxuICAgIG5leHQoaDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMucGFydGljbGVTaW0ubmV4dChoKTtcbiAgICAgICAgdGhpcy5iZWFtQnJlYWsoKTtcbiAgICB9XG5cbiAgICBzYXZlKCk6IFRydXNzU2ltU3RhdGUge1xuICAgICAgICB0aGlzLmJlYW1zU2F2ZWQgPSB0cnVlO1xuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdGhpcy5iZWFtcykge1xuICAgICAgICAgICAgT2JqZWN0LmZyZWV6ZShiZWFtKTtcbiAgICAgICAgfVxuICAgICAgICBPYmplY3QuZnJlZXplKHRoaXMuYmVhbXMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGFydGljbGVTdGF0ZTogdGhpcy5wYXJ0aWNsZVNpbS5zYXZlKCksXG4gICAgICAgICAgICBiZWFtU3RhdGU6IHRoaXMuYmVhbXMsXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJlc3RvcmUodDogbnVtYmVyLCBzOiBUcnVzc1NpbVN0YXRlKTogdm9pZCB7XG4gICAgICAgIHRoaXMuYmVhbXMgPSBzLmJlYW1TdGF0ZTtcbiAgICAgICAgdGhpcy5wYXJ0aWNsZVNpbS5yZXN0b3JlKHQsIHMucGFydGljbGVTdGF0ZSk7XG4gICAgICAgIC8vIHRoaXMuYmVhbXMgd2FzIG9yaWdpbmFsbHkgcmV0dXJuZWQgZnJvbSBzYXZlKCksIHNvIGRvbid0IG11dGF0ZSBpdC5cbiAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgc3RhdGVFcXVhbHMoczogVHJ1c3NTaW1TdGF0ZSk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAocy5iZWFtU3RhdGUubGVuZ3RoICE9PSB0aGlzLmJlYW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ2JlYW1TdGF0ZSBsZW5ndGggbWlzbWF0Y2gnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYmVhbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGIxID0gcy5iZWFtU3RhdGVbaV07XG4gICAgICAgICAgICBjb25zdCBiMiA9IHRoaXMuYmVhbXNbaV07XG4gICAgICAgICAgICBpZiAoYjEuZGVjayAhPT0gYjIuZGVjayB8fCBiMS5sICE9PSBiMi5sIHx8IGIxLnAxICE9PSBiMi5wMSB8fCBiMS5wMiAhPT0gYjIucDIgfHwgYjEudyAhPT0gYjIudykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBiZWFtU3RhdGUgbWlzbWF0Y2ggYXQgWyR7aX1dYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNpbSA9IHRoaXMucGFydGljbGVTaW07XG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IHNpbS5sZW5ndGgoKTtcbiAgICAgICAgaWYgKHMucGFydGljbGVTdGF0ZS5sZW5ndGggIT09IGxlbmd0aCAqIDUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdwYXJ0aWNsZVN0YXRlIGxlbmd0aCBtaXNtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBzID0gcy5wYXJ0aWNsZVN0YXRlO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucGFydGljbGVTaW0ubGVuZ3RoKCk7IGkgKyspIHtcbiAgICAgICAgICAgIGlmIChzaW0uZ2V0RHgoaSkgIT09IHBzW2kgKiA0XVxuICAgICAgICAgICAgICAgICAgICB8fCBzaW0uZ2V0RHkoaSkgIT09IHBzW2kgKiA0ICsgMV1cbiAgICAgICAgICAgICAgICAgICAgfHwgc2ltLmdldFZ4KGkpICE9PSBwc1tpICogNCArIDJdXG4gICAgICAgICAgICAgICAgICAgIHx8IHNpbS5nZXRWeShpKSAhPT0gcHNbaSAqIDQgKyAzXVxuICAgICAgICAgICAgICAgICAgICB8fCBzaW0uZ2V0TShpKSAhPT0gcHNbbGVuZ3RoICogNCArIGldKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYHBhcnRpY2xlU3RhdGUgbWlzbWF0Y2ggYXQgWyR7aX1dYCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJlc2V0QmVhbShpOiBudW1iZXIsIHAxOiBudW1iZXIsIHAyOiBudW1iZXIsIGw6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zb2xlLmxvZyhgcmVzZXRCZWFtICR7aX0gJHtwMX0gJHtwMn0gJHtsfSwgb2xkICR7dGhpcy5iZWFtc1tpXS5wMX0gJHt0aGlzLmJlYW1zW2ldLnAyfSAke3RoaXMuYmVhbXNbaV0ubH1gKTtcbiAgICAgICAgY29uc3QgZHggPSB0aGlzLmdldER4KHAyKSAtIHRoaXMuZ2V0RHgocDEpO1xuICAgICAgICBjb25zdCBkeSA9IHRoaXMuZ2V0RHkocDIpIC0gdGhpcy5nZXREeShwMSk7XG4gICAgICAgIGNvbnN0IGFjdHVhbGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICBpZiAoYWN0dWFsbCAqIDEuMjUgPCBsIHx8IGFjdHVhbGwgKiAwLjc1ID4gbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwcmUtc3RyZXNzZWQgYmVhbSB0b28gc3RyZXNzZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5iZWFtc1NhdmVkKSB7XG4gICAgICAgICAgICB0aGlzLmJlYW1zID0gdGhpcy5iZWFtcy5zbGljZSgpO1xuICAgICAgICAgICAgdGhpcy5iZWFtc1NhdmVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYmVhbSA9IHsgLi4udGhpcy5iZWFtc1tpXSB9O1xuICAgICAgICBiZWFtLnAxID0gcDE7XG4gICAgICAgIGJlYW0ucDIgPSBwMjtcbiAgICAgICAgYmVhbS5sID0gbDtcbiAgICAgICAgYmVhbS5icm9rZW4gPSB0cnVlO1xuICAgICAgICBPYmplY3QuZnJlZXplKGJlYW0pO1xuICAgICAgICB0aGlzLmJlYW1zW2ldID0gYmVhbTtcbiAgICB9XG5cbiAgICBhZGRCZWFtKHAxOiBudW1iZXIsIHAyOiBudW1iZXIsIG06IE1hdGVyaWFsLCB3OiBudW1iZXIsIGw6IG51bWJlciwgZGVjazogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmJlYW1zU2F2ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuYmVhbXMgPSB0aGlzLmJlYW1zLnNsaWNlKCk7XG4gICAgICAgICAgICB0aGlzLmJlYW1zU2F2ZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkeCA9IHRoaXMuZ2V0RHgocDIpIC0gdGhpcy5nZXREeChwMSk7XG4gICAgICAgIGNvbnN0IGR5ID0gdGhpcy5nZXREeShwMikgLSB0aGlzLmdldER5KHAxKTtcbiAgICAgICAgY29uc3QgYWN0dWFsbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgIGlmIChhY3R1YWxsICogMS4yNSA8IGwgfHwgYWN0dWFsbCAqIDAuNzUgPiBsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3ByZS1zdHJlc3NlZCBiZWFtIHRvbyBzdHJlc3NlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJlYW06IEJlYW0gPSB7IHAxLCBwMiwgbSwgdywgbCwgZGVjaywgaG1hcGk6IC0xLCBicm9rZW46IHRydWV9O1xuICAgICAgICBPYmplY3QuZnJlZXplKGJlYW0pO1xuICAgICAgICBjb25zdCBpID0gdGhpcy5iZWFtcy5sZW5ndGg7XG4gICAgICAgIGNvbnNvbGUubG9nKGBhZGRCZWFtICR7aX0gJHtwMX0gJHtwMn0gJHt3fSAke2x9ICR7ZGVja31gKTtcbiAgICAgICAgdGhpcy5iZWFtc1tpXSA9IGJlYW07XG4gICAgICAgIHJldHVybiBpO1xuICAgIH1cblxuICAgIGdldER4KGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnRpY2xlU2ltLmdldER4KGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZml4ZWRQaW5zW2kgKiAyICsgdGhpcy5maXhlZFBpbnMubGVuZ3RoXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXREeShpOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJ0aWNsZVNpbS5nZXREeShpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpeGVkUGluc1tpICogMiArIDEgKyB0aGlzLmZpeGVkUGlucy5sZW5ndGhdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldFZ4KGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnRpY2xlU2ltLmdldFZ4KGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0VnkoaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFydGljbGVTaW0uZ2V0VnkoaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYmVhbUJyZWFrKCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYmVhbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGJlYW0gPSB0aGlzLmJlYW1zW2ldO1xuICAgICAgICAgICAgaWYgKGJlYW0uYnJva2VuKSB7XG4gICAgICAgICAgICAgICAgLy8gQmVhbSBoYXMgYWxyZWFkeSBiZWVuIGJyb2tlbi5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gYmVhbS5tO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgaWYgKHAxIDwgMCAmJiBwMiA8IDApIHtcbiAgICAgICAgICAgICAgICAvLyBCb3RoIGVuZHMgYXJlIG5vdCBtb3ZlYWJsZS5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHgxID0gdGhpcy5nZXREeChwMSk7XG4gICAgICAgICAgICBjb25zdCB4MiA9IHRoaXMuZ2V0RHgocDIpO1xuICAgICAgICAgICAgY29uc3QgZHggPSB4MiAtIHgxO1xuICAgICAgICAgICAgY29uc3QgeTEgPSB0aGlzLmdldER5KHAxKTtcbiAgICAgICAgICAgIGNvbnN0IHkyID0gdGhpcy5nZXREeShwMik7XG4gICAgICAgICAgICBjb25zdCBkeSA9IHkyIC0geTE7XG4gICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgICAgIGlmIChsID4gYmVhbS5sICogbWF0ZXJpYWwudGVuc2lvbllpZWxkKSB7XG4gICAgICAgICAgICAgICAgLy8gQnJlYWsgdGhlIGJlYW0gYXQgcDEuXG4gICAgICAgICAgICAgICAgY29uc3QgdnggPSB0aGlzLmdldFZ4KHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eSA9IHRoaXMuZ2V0VnkocDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hc3MgPSBiZWFtLmwgKiBiZWFtLncgKiBiZWFtLm0uZGVuc2l0eSAqIDAuNTtcbiAgICAgICAgICAgICAgICBpZiAocDEgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFydGljbGVTaW0ucmVzZXQocDEsIHRoaXMucGFydGljbGVTaW0uZ2V0TShwMSkgLSBtYXNzLCB4MSwgeTEsIHZ4LCB2eSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRCZWFtKGksIHRoaXMucGFydGljbGVTaW0uYWRkKG1hc3MsIHgxLCB5MSwgdngsIHZ5KSwgYmVhbS5wMiwgbCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGwgPCBiZWFtLmwgKiBtYXRlcmlhbC5idWNrbGVZaWVsZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBidWNrbGUgJHtpfWApO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hc3MgPSBiZWFtLmwgKiBiZWFtLncgKiBiZWFtLm0uZGVuc2l0eTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eDEgPSB0aGlzLmdldFZ4KHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eTEgPSB0aGlzLmdldFZ5KHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eDIgPSB0aGlzLmdldFZ4KHAyKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eTIgPSB0aGlzLmdldFZ5KHAyKTtcbiAgICAgICAgICAgICAgICAvLyBCdWNrbGluZyBwb2ludCBpcyB0aGUgbWlkcG9pbnQgZGlzcGxhY2VkIGJ5IGEgYml0LlxuICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYWNlID0gKGJlYW0ubCAtIGwpIC8gYmVhbS5sO1xuICAgICAgICAgICAgICAgIGNvbnN0IHB4ID0gKHgxICsgeDIpICogMC41ICsgZHkgKiBkaXNwbGFjZTtcbiAgICAgICAgICAgICAgICBjb25zdCBweSA9ICh5MSArIHkyKSAqIDAuNSAtIGR4ICogZGlzcGxhY2U7XG4gICAgICAgICAgICAgICAgY29uc3QgcGwgPSBNYXRoLnNxcnQoTWF0aC5wb3cocHggLSB4MSwgMikgKyBNYXRoLnBvdyhweSAtIHkxLCAyKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucGFydGljbGVTaW0uYWRkKFxuICAgICAgICAgICAgICAgICAgICBtYXNzICogMC41LFxuICAgICAgICAgICAgICAgICAgICBweCwgcHksXG4gICAgICAgICAgICAgICAgICAgICh2eDEgKyB2eDIpICogMC41LCAodnkxICsgdnkyKSAqIDAuNSwgICAvLyBUT0RPOiBhZGQgc29tZSBtdWx0aXBsZSBvZiAoZHksIC1keCkgKiAoYmVhbS5sIC0gbClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmIChwMSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFydGljbGVTaW0ucmVzZXQocDEsIHRoaXMucGFydGljbGVTaW0uZ2V0TShwMSkgLSBtYXNzICogLTAuMjUsIHgxLCB5MSwgdngxLCB2eTEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocDIgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcnRpY2xlU2ltLnJlc2V0KHAyLCB0aGlzLnBhcnRpY2xlU2ltLmdldE0ocDIpIC0gbWFzcyAqIC0wLjI1LCB4MiwgeTIsIHZ4MiwgdnkyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5yZXNldEJlYW0oaSwgcDEsIHAsIHBsKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEJlYW0ocCwgcDIsIGJlYW0ubSwgYmVhbS53LCBwbCwgYmVhbS5kZWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpOiB2b2lkIHtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0aGlzLmJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCB4MSA9IHRoaXMuZ2V0RHgoYi5wMSk7XG4gICAgICAgICAgICBjb25zdCB5MSA9IHRoaXMuZ2V0RHkoYi5wMSk7XG4gICAgICAgICAgICBjb25zdCB4MiA9IHRoaXMuZ2V0RHgoYi5wMik7XG4gICAgICAgICAgICBjb25zdCB5MiA9IHRoaXMuZ2V0RHkoYi5wMik7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYi53O1xuICAgICAgICAgICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBiLm0uc3R5bGU7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHgubW92ZVRvKHgxLCB5MSk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHgyLCB5Mik7XG4gICAgICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICAgICAgICBpZiAoYi5kZWNrKSB7XG4gICAgICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJicm93blwiOyAgLy8gVE9ETzogZGVjayBzdHlsZVxuICAgICAgICAgICAgICAgIGN0eC5saW5lV2lkdGggPSBiLncgKiAwLjc1O1xuICAgICAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHgxLCB5MSk7XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyh4MiwgeTIpO1xuICAgICAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgZCBvZiB0aGlzLmRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBkeCA9IHRoaXMucGFydGljbGVTaW0uZ2V0RHgoZC5wKTtcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gdGhpcy5wYXJ0aWNsZVNpbS5nZXREeShkLnApO1xuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGQubS5zdHlsZTtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5lbGxpcHNlKGR4LCBkeSwgZC5yLCBkLnIsIDAsIDAsIDIgKiBNYXRoLlBJKTtcbiAgICAgICAgICAgIGN0eC5maWxsKCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuIl19