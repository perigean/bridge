// Copyright Charles Dueck 2020

import { ODEMethod, Derivative } from "./ode.js";

function addWithScale(x: Float32Array, s: number, y: Float32Array, out: Float32Array): Float32Array {
    const n = x.length;
    for (let i = 0; i < n; i++) {
        out[i] = x[i] + s * y[i];
    }
    return out;
}

export interface ODE {
    t: number;
    y: Float32Array;
}

export class RungeKutta4 implements ODEMethod {
    t: number;
    y: Float32Array;
    private k1: Float32Array;
    private k2: Float32Array;
    private k3: Float32Array;
    private k4: Float32Array;
    private scratch: Float32Array;
    private derivative: Derivative;

    constructor(y: Float32Array, derivative: Derivative) {
        this.t = 0;
        this.y = y;
        this.k1 = new Float32Array(y.length);
        this.k2 = new Float32Array(y.length);
        this.k3 = new Float32Array(y.length);
        this.k4 = new Float32Array(y.length);
        this.scratch = new Float32Array(y.length);
        this.derivative = derivative;
    }

    next(h: number): void {
        const t = this.t;
        const y = this.y;
        const k1 = this.k1;
        const k2 = this.k2;
        const k3 = this.k3;
        const k4 = this.k4;
        const scratch = this.scratch;
        const derivative = this.derivative;
        derivative(t, y, k1);
        derivative(t + 0.5 * h, addWithScale(y, 0.5 * h, k1, scratch), k2);
        derivative(t + 0.5 * h, addWithScale(y, 0.5 * h, k2, scratch), k3);
        derivative(t + h, addWithScale(y, h, k3, scratch), k4);
        const n = y.length;
        for (let i = 0; i < n; i++) {
            y[i] += h * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]) / 6.0;
        }
        this.t += h;
    }
};
