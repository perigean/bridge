// Copyright Charles Dueck 2020

export interface Derivative {
    (t: number, y: Float32Array, dydt: Float32Array): void;
};

export interface ODECtor {
    new (y: Float32Array, derivative: Derivative): ODEMethod;
};

export interface ODEMethod {
    readonly t: number;
    readonly y: Float32Array;
    next(h: number): void;
};

export interface DynamicODECtor<State> {
    new (y: Float32Array, derivative: Derivative): DynamicODEMethod<State>;
};

export interface DynamicODEMethod<State> extends ODEMethod {
    save(): State;
    restore(t: number, s: State): void;
    add(...ys: number[]): void;
};

export function resizeFloat32Array(a: Float32Array | undefined, length: number): Float32Array {
    if (a === undefined) return new Float32Array(length);
    if (a.length === length) return a;
    const buffer = a.buffer;
    const byteLength = length * Float32Array.BYTES_PER_ELEMENT;
    if (buffer.byteLength < byteLength) {
        // Allocate extra bytes, to the next power of 2, to reduce reallocations.
        const newByteLength = Math.pow(2, Math.ceil(Math.log2(byteLength + 1)));
        const newBuffer = new ArrayBuffer(newByteLength);
        const newA = new Float32Array(newBuffer, 0, length);
        newA.set(a);
        return newA;
    }
    // TODO: else if for shrinking buffer? Probably don't ever need to.

    // NB: re-using the same ArrayBuffer, so we don't need to copy any values.
    return new Float32Array(buffer, 0, length);
}
