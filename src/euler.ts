// Copyright Charles Dueck 2020

import { ODEMethod, Derivative } from "./ode.js";

export class Euler implements ODEMethod {
    t: number;
    y: Float32Array;
    private dydt: Float32Array;
    private derivative: Derivative;

    constructor(y: Float32Array, derivative: Derivative) {
        this.t = 0;
        this.y = y;
        this.dydt = new Float32Array(y.length);
        this.derivative = derivative;
    }

    next(h: number): void {
        const y = this.y;
        const dydt = this.dydt;
        this.derivative(this.t, y, dydt);
        for (let i = 0; i < y.length; i++) {
            y[i] += h * dydt[i];
        }
        this.t += h;
    }
};