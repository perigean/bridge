// Copyright 2021 Charles Dueck

import { DynamicODECtor, DynamicODEMethod, resizeFloat32Array } from "./ode.js";
import { Point2D } from "./point.js";

export type ParticleInit = {
    d: Point2D;
    v?: Point2D;
    m: number;
};

export function getLength(y: Float32Array): number {
    return y.length >> 2;   // y.length / 4
}

export function getDx(y: Float32Array, i: number): number {
    return y[i * 4];
}

export function getDy(y: Float32Array, i: number): number {
    return y[i * 4 + 1];
}

export function getVx(y: Float32Array, i: number): number {
    return y[i * 4 + 2];
}

export function getVy(y: Float32Array, i: number): number {
    return y[i * 4 + 3];
}

export function applyForce(dydt: Float32Array, m: Float32Array, i: number, fx: number, fy: number): void {
    if (fx === NaN || fy === NaN) throw new Error('NaN force');
    if (fx === Infinity || fy === Infinity) throw new Error('Infinity force');
    dydt[i*4+2] += fx / m[i];
    dydt[i*4+3] += fy / m[i];
    if (dydt[i*4+2] === NaN || dydt[i*4+2] === Infinity || dydt[i*4+3] === NaN || dydt[i*4+3] === Infinity) throw new Error('bad dydt');
    if (Math.abs(dydt[i*4+2]) > 1000000000 || Math.abs(dydt[i*4+3]) > 1000000000) {
        throw new Error("high v'");
    }
}

export function applyAcceleration(dydt: Float32Array, i: number, ax: number, ay: number): void {
    if (ax === NaN || ay === NaN) throw new Error('NaN acceleration');
    if (ax === Infinity || ay === Infinity) throw new Error('Infinity acceleration');
    dydt[i*4+2] += ax;
    dydt[i*4+3] += ay;
    if (dydt[i*4+2] === NaN || dydt[i*4+2] === Infinity || dydt[i*4+3] === NaN || dydt[i*4+3] === Infinity) throw new Error('bad dydt');
    if (Math.abs(dydt[i*4+2]) > 1000000000 || Math.abs(dydt[i*4+3]) > 1000000000) {
        throw new Error("high v'");
    }
}

export interface ParticleForce {
    (t: number, y: Float32Array, m: Float32Array, dydt: Float32Array): void;
};

export class ParticleSim {
    private g: Point2D;
    private dampk: number;
    private m: Float32Array;
    private method: DynamicODEMethod<Float32Array>;

    constructor(odeCtor: DynamicODECtor<Float32Array>, init: ParticleInit[], g: Point2D, dampk: number, force: ParticleForce) {
        this.g = g;
        this.dampk = dampk;
        this.m = new Float32Array(init.length);
        const y = new Float32Array(init.length * 4);
        for (let i = 0; i < init.length; i++) {
            this.m[i] = init[i].m;
            y[i*4+0] = init[i].d[0];
            y[i*4+1] = init[i].d[1];
            const v = init[i].v;
            if (v !== undefined) {
                y[i*4+2] = v[0];
                y[i*4+3] = v[1];
            }
        }

        // TODO: Clear out init so we don't capture it in the lambdas below?

        const odeDerivative = (t: number, y: Float32Array, dydt: Float32Array): void => {
            const length = this.m.length;
            const gx = this.g[0];
            const gy = this.g[1];
            const dampk = this.dampk;
            for (let i = 0; i < length; i++) {
                // Derivative of position is velocity.
                dydt[i*4+0] = y[i*4+2];
                dydt[i*4+1] = y[i*4+3];
                // Start derivative of velocity with acceleration due to gravity and damping.
                dydt[i*4+2] = gx - dampk * y[i*4+2];
                dydt[i*4+3] = gy - dampk * y[i*4+3];
            }
            // Apply all other forces (beyond gravity)
            force(t, y, this.m, dydt);
        };
        this.method = new odeCtor(y, odeDerivative);
    }

    save(): Float32Array {
        const m = this.m;
        const y = this.method.y;
        const s = new Float32Array(m.length + y.length);
        s.set(y, 0);
        s.set(m, y.length);
        return s;
    }

    restore(t: number, s: Float32Array): void {
        if (s.length % 5 !== 0) {
            throw new Error('saved state length must be a multiple of 5');
        }
        const length = s.length / 5;
        this.method.restore(t, s.subarray(0, length * 4));
        this.m = resizeFloat32Array(this.m, length);
        this.m.set(s.subarray(length * 4, length * 5));
    }

    reset(i: number, m: number, dx: number, dy: number, vx: number, vy: number): void {
        const y = this.method.y;
        console.log(`reset ${i} ${m} ${dx} ${dy} ${vx} ${vy}, old ${this.m[i]} ${y[i*4]} ${y[i*4+1]} ${y[i*4+1]} ${y[i*4+1]}`);
        this.m[i] = m;
        y[i * 4] = dx;
        y[i * 4 + 1] = dy;
        y[i * 4 + 2] = vx;
        y[i * 4 + 3] = vy;
    }
    add(m: number, dx: number, dy: number, vx?: number, vy?: number): number {
        const i = this.m.length;
        console.log(`add ${i} ${m} ${dx} ${dy} ${vx || 0} ${vy || 0}`);
        this.m = resizeFloat32Array(this.m, i + 1);
        this.m[i] = m;
        this.method.add(dx, dy, vx || 0, vy || 0);
        return i;
    }
    get t(): number {
        return this.method.t;
    }
    next(h: number): void {
        this.method.next(h);
    }
    length(): number {
        return this.m.length;
    }
    getM(i: number): number {
        return this.m[i];
    }
    getDx(i: number): number {
        return this.method.y[i*4+0];
    }
    getDy(i: number): number {
        return this.method.y[i*4+1];
    }
    getVx(i: number): number {
        return this.method.y[i*4+2];
    }
    getVy(i: number): number {
        return this.method.y[i*4+3];
    }
};