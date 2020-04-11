
export type Point2D = [number, number];

export function pointDistance(p1: Point2D, p2: Point2D): number {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

export function pointEquals(p1: Point2D, p2: Point2D): boolean {
    return p1[0] === p2[0] && p1[1] === p2[1];
}
