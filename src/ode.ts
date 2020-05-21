// Copyright Charles Dueck 2020

export interface Derivative {
    (t: number, y: Float32Array, dydt: Float32Array): void;
};

export interface ODEMethod {
    t: number;
    y: Float32Array;
    next(h: number): void;
};