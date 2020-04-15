// Copyright Charles Dueck 2020

export type Point2D = [number, number];

export function pointDistance(p1: Point2D, p2: Point2D): number {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

export function pointEquals(p1: Point2D, p2: Point2D): boolean {
    return p1[0] === p2[0] && p1[1] === p2[1];
}

export function pointSub(p1: Point2D, p2: Point2D): Point2D {
    return [
        p1[0] - p2[0],
        p1[1] - p2[1],
    ];
}

export function pointAdd(p1: Point2D, p2: Point2D): Point2D {
    return [
        p1[0] + p2[0],
        p1[1] + p2[1],
    ];
}

export function pointMidpoint(p1: Point2D, p2: Point2D): Point2D {
    return [
        (p1[0] + p2[0]) * 0.5,
        (p1[1] + p2[1]) * 0.5,
    ];
}

export function pointAngle(p: Point2D): number {
    return Math.atan2(p[0], p[1]);
}

// pointToBasis computes [x, y] s.t. x * n + y * m = p.
export function pointToBasis(n: Point2D, m: Point2D, p: Point2D): Point2D {
    const det = n[0] * m[1] - n[1] * m[0];
    if (det === 0) {
        throw new Error("TODO: support non invertable basis");
    }
    return [
        (m[1] * p[0] - m[0] * p[1]) / det,
        (n[0] * p[1] - n[1] * p[0]) / det,
    ];
}

export function pointFromBasis(n: Point2D, m: Point2D, q: Point2D): Point2D {
    return [
        n[0] * q[0] + m[0] * q[1],
        n[1] * q[0] + m[1] * q[1],
    ];
}