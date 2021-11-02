// Copyright Charles Dueck 2020

import { DynamicODEMethod, Derivative, resizeFloat32Array } from "./ode.js";

export class Euler implements DynamicODEMethod<Float32Array> {
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
    save(): Float32Array {
        return new Float32Array(this.y);
    }

    add(...ys: number[]): void {
        const l = this.y.length;
        this.y = resizeFloat32Array(this.y, l + ys.length);
        this.dydt = resizeFloat32Array(this.dydt, this.y.length);
        this.y.set(ys, l);
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

    restore(t: number, y: Float32Array): void {
        this.t = t;
        this.y = resizeFloat32Array(this.y, y.length);
        this.dydt = resizeFloat32Array(this.dydt, y.length);
        this.y.set(y);
    }
};