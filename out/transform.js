// Copyright Charles Dueck 2020
function transformIdentityCreate() {
    return [
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
    ];
}
function transformTranslateCreate(x, y) {
    return [
        1.0, 0.0, x,
        0.0, 1.0, y,
    ];
}
function transformScaleCreate(s) {
    return [
        s, 0.0, 0.0,
        0.0, s, 0.0,
    ];
}
function transformStretchCreate(sx, sy) {
    return [
        sx, 0.0, 0.0,
        0.0, sy, 0.0,
    ];
}
function transformRotateCreate(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        c, -s, 0.0,
        s, c, 0.0,
    ];
}
// combine two transforms, so t1 is applied, then t2
function transformCompose(t1, t2) {
    return [
        t2[0] * t1[0] + t2[1] * t1[3], t2[0] * t1[1] + t2[1] * t1[4], t2[0] * t1[2] + t2[1] * t1[5] + t2[2],
        t2[3] * t1[0] + t2[4] * t1[3], t2[3] * t1[1] + t2[4] * t1[4], t2[3] * t1[2] + t2[4] * t1[5] + t2[5],
    ];
}
function transformTranslate(t, x, y) {
    return [
        t[0], t[1], t[2] + x,
        t[3], t[4], t[5] + y,
    ];
}
function transformScale(t, s) {
    return [
        s * t[0], s * t[1], s * t[2],
        s * t[3], s * t[4], s * t[5],
    ];
}
function transformRotate(t, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        c * t[0] - s * t[3], c * t[1] - s * t[4], c * t[2] - s * t[5],
        s * t[0] + c * t[3], s * t[1] + c * t[4], s * t[2] + c * t[5],
    ];
}
function transformStretch(t, sx, sy) {
    return [
        sx * t[0], sx * t[1], sx * t[2],
        sy * t[3], sy * t[4], sy * t[5],
    ];
}
function transformInvert(t) {
    const det = t[0] * t[4] - t[3] * t[1];
    const dx = t[1] * t[5] - t[4] * t[2];
    const dy = t[3] * t[2] - t[0] * t[5];
    return [
        t[4] / det, -t[1] / det, dx / det,
        -t[3] / det, t[0] / det, dy / det,
    ];
}
function transformPoint(t, p) {
    return [
        p[0] * t[0] + p[1] * t[1] + t[2],
        p[0] * t[3] + p[1] * t[4] + t[5],
    ];
}
function transformMutatePoint(t, p) {
    const x = p[0] * t[0] + p[1] * t[1] + t[2];
    const y = p[0] * t[3] + p[1] * t[4] + t[5];
    p[0] = x;
    p[1] = y;
}
function transformNormal(t, n) {
    return [
        n[0] * t[0] + n[1] * t[1],
        n[0] * t[3] + n[1] * t[4],
    ];
}
function transformMutateNormal(t, n) {
    const x = n[0] * t[0] + n[1] * t[1];
    const y = n[0] * t[3] + n[1] * t[4];
    n[0] = x;
    n[1] = y;
}
export { transformCompose, transformIdentityCreate, transformInvert, transformMutateNormal, transformMutatePoint, transformNormal, transformPoint, transformScale, transformScaleCreate, transformStretch, transformStretchCreate, transformTranslate, transformTranslateCreate, transformRotate, transformRotateCreate, };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNmb3JtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3RyYW5zZm9ybS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwrQkFBK0I7QUFTL0IsU0FBUyx1QkFBdUI7SUFDOUIsT0FBTztRQUNMLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztRQUNiLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztLQUNkLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxDQUFTLEVBQUUsQ0FBUztJQUNwRCxPQUFPO1FBQ0wsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQ1gsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO0tBQ1osQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLENBQVM7SUFDckMsT0FBTztRQUNMLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRztRQUNYLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRztLQUNaLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxzQkFBc0IsQ0FBQyxFQUFVLEVBQUUsRUFBVTtJQUNwRCxPQUFPO1FBQ0wsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHO1FBQ1osR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHO0tBQ2IsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLEtBQWE7SUFDMUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMxQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFCLE9BQU87UUFDTCxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRztRQUNWLENBQUMsRUFBRyxDQUFDLEVBQUUsR0FBRztLQUNYLENBQUM7QUFDSixDQUFDO0FBRUQsb0RBQW9EO0FBQ3BELFNBQVMsZ0JBQWdCLENBQUMsRUFBWSxFQUFFLEVBQVk7SUFDbEQsT0FBTztRQUNMLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztLQUNwRyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsQ0FBVyxFQUFFLENBQVMsRUFBRSxDQUFTO0lBQzNELE9BQU87UUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7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LENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUMxQixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQUMsQ0FBVyxFQUFFLENBQVU7SUFDcEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ1QsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNYLENBQUM7QUFFRCxPQUFPLEVBQ0wsZ0JBQWdCLEVBQ2hCLHVCQUF1QixFQUN2QixlQUFlLEVBQ2YscUJBQXFCLEVBQ3JCLG9CQUFvQixFQUNwQixlQUFlLEVBQ2YsY0FBYyxFQUNkLGNBQWMsRUFDZCxvQkFBb0IsRUFDcEIsZ0JBQWdCLEVBQ2hCLHNCQUFzQixFQUN0QixrQkFBa0IsRUFDbEIsd0JBQXdCLEVBQ3hCLGVBQWUsRUFDZixxQkFBcUIsR0FDdEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHtQb2ludDJEfSBmcm9tIFwicG9pbnQuanNcIlxuXG4vLyBUT0RPOiB1bml0IHRlc3RzLCBpdCB3aWxsIHN1Y2sgaWYgdGhlcmUgaXMgYSB0eXBvIGluIGhlcmUsIHNvIGZpbmQgaXQgZmlyc3QhXG4vLyBUT0RPOiBhcHBseSBSZWFkb25seTw+IHRvIGV2ZXJ5dGhpbmcgdGhhdCBjYW4uXG5cbmV4cG9ydCB0eXBlIEFmZmluZTJEID0gW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JZGVudGl0eUNyZWF0ZSgpOiBBZmZpbmUyRCB7XG4gIHJldHVybiBbXG4gICAgMS4wLCAwLjAsIDAuMCxcbiAgICAwLjAsIDEuMCwgMC4wLFxuICBdO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1UcmFuc2xhdGVDcmVhdGUoeDogbnVtYmVyLCB5OiBudW1iZXIpOiBBZmZpbmUyRCB7XG4gIHJldHVybiBbXG4gICAgMS4wLCAwLjAsIHgsXG4gICAgMC4wLCAxLjAsIHksXG4gIF07XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVNjYWxlQ3JlYXRlKHM6IG51bWJlcik6IEFmZmluZTJEIHtcbiAgcmV0dXJuIFtcbiAgICBzLCAwLjAsIDAuMCxcbiAgICAwLjAsIHMsIDAuMCxcbiAgXTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtU3RyZXRjaENyZWF0ZShzeDogbnVtYmVyLCBzeTogbnVtYmVyKTogQWZmaW5lMkQge1xuICByZXR1cm4gW1xuICAgIHN4LCAwLjAsIDAuMCxcbiAgICAwLjAsIHN5LCAwLjAsXG4gIF07XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVJvdGF0ZUNyZWF0ZShhbmdsZTogbnVtYmVyKTogQWZmaW5lMkQge1xuICBjb25zdCBjID0gTWF0aC5jb3MoYW5nbGUpO1xuICBjb25zdCBzID0gTWF0aC5zaW4oYW5nbGUpO1xuICByZXR1cm4gW1xuICAgIGMsIC1zLCAwLjAsXG4gICAgcywgIGMsIDAuMCxcbiAgXTtcbn1cblxuLy8gY29tYmluZSB0d28gdHJhbnNmb3Jtcywgc28gdDEgaXMgYXBwbGllZCwgdGhlbiB0MlxuZnVuY3Rpb24gdHJhbnNmb3JtQ29tcG9zZSh0MTogQWZmaW5lMkQsIHQyOiBBZmZpbmUyRCk6IEFmZmluZTJEIHtcbiAgcmV0dXJuIFtcbiAgICB0MlswXSAqIHQxWzBdICsgdDJbMV0gKiB0MVszXSwgdDJbMF0gKiB0MVsxXSArIHQyWzFdICogdDFbNF0sIHQyWzBdICogdDFbMl0gKyB0MlsxXSAqIHQxWzVdICsgdDJbMl0sXG4gICAgdDJbM10gKiB0MVswXSArIHQyWzRdICogdDFbM10sIHQyWzNdICogdDFbMV0gKyB0Mls0XSAqIHQxWzRdLCB0MlszXSAqIHQxWzJdICsgdDJbNF0gKiB0MVs1XSArIHQyWzVdLFxuICBdO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1UcmFuc2xhdGUodDogQWZmaW5lMkQsIHg6IG51bWJlciwgeTogbnVtYmVyKTogQWZmaW5lMkQge1xuICByZXR1cm4gW1xuICAgIHRbMF0sIHRbMV0sIHRbMl0gKyB4LFxuICAgIHRbM10sIHRbNF0sIHRbNV0gKyB5LFxuICBdO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1TY2FsZSh0OiBBZmZpbmUyRCwgczogbnVtYmVyKTogQWZmaW5lMkQge1xuICByZXR1cm4gW1xuICAgIHMgKiB0WzBdLCBzICogdFsxXSwgcyAqIHRbMl0sXG4gICAgcyAqIHRbM10sIHMgKiB0WzRdLCBzICogdFs1XSxcbiAgXTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtUm90YXRlKHQ6IEFmZmluZTJELCBhbmdsZTogbnVtYmVyKTogQWZmaW5lMkQge1xuICBjb25zdCBjID0gTWF0aC5jb3MoYW5nbGUpO1xuICBjb25zdCBzID0gTWF0aC5zaW4oYW5nbGUpO1xuICByZXR1cm4gW1xuICAgIGMgKiB0WzBdIC0gcyAqIHRbM10sIGMgKiB0WzFdIC0gcyAqIHRbNF0sIGMgKiB0WzJdIC0gcyAqIHRbNV0sXG4gICAgcyAqIHRbMF0gKyBjICogdFszXSwgcyAqIHRbMV0gKyBjICogdFs0XSwgcyAqIHRbMl0gKyBjICogdFs1XSxcbiAgXTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtU3RyZXRjaCh0OiBBZmZpbmUyRCwgc3g6IG51bWJlciwgc3k6IG51bWJlcik6IEFmZmluZTJEIHtcbiAgcmV0dXJuIFtcbiAgICBzeCAqIHRbMF0sIHN4ICogdFsxXSwgc3ggKiB0WzJdLFxuICAgIHN5ICogdFszXSwgc3kgKiB0WzRdLCBzeSAqIHRbNV0sXG4gIF07XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUludmVydCh0OiBBZmZpbmUyRCk6IEFmZmluZTJEIHtcbiAgY29uc3QgZGV0ID0gdFswXSAqIHRbNF0gLSB0WzNdICogdFsxXTtcbiAgY29uc3QgZHggPSB0WzFdICogdFs1XSAtIHRbNF0gKiB0WzJdO1xuICBjb25zdCBkeSA9IHRbM10gKiB0WzJdIC0gdFswXSAqIHRbNV07XG4gIHJldHVybiBbXG4gICAgIHRbNF0gLyBkZXQsIC10WzFdIC8gZGV0LCBkeCAvIGRldCxcbiAgICAtdFszXSAvIGRldCwgIHRbMF0gLyBkZXQsIGR5IC8gZGV0LFxuICBdO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1Qb2ludCh0OiBSZWFkb25seTxBZmZpbmUyRD4sIHA6IFBvaW50MkQpOiBQb2ludDJEIHtcbiAgcmV0dXJuIFtcbiAgICBwWzBdICogdFswXSArIHBbMV0gKiB0WzFdICsgdFsyXSxcbiAgICBwWzBdICogdFszXSArIHBbMV0gKiB0WzRdICsgdFs1XSxcbiAgXTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtTXV0YXRlUG9pbnQodDogQWZmaW5lMkQsIHA6IFBvaW50MkQpIHtcbiAgY29uc3QgeCA9IHBbMF0gKiB0WzBdICsgcFsxXSAqIHRbMV0gKyB0WzJdO1xuICBjb25zdCB5ID0gcFswXSAqIHRbM10gKyBwWzFdICogdFs0XSArIHRbNV07XG4gIHBbMF0gPSB4O1xuICBwWzFdID0geTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtTm9ybWFsKHQ6IEFmZmluZTJELCBuOiBQb2ludDJEKTogUG9pbnQyRCB7XG4gIHJldHVybiBbXG4gICAgblswXSAqIHRbMF0gKyBuWzFdICogdFsxXSxcbiAgICBuWzBdICogdFszXSArIG5bMV0gKiB0WzRdLFxuICBdO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1NdXRhdGVOb3JtYWwodDogQWZmaW5lMkQsIG46IFBvaW50MkQpIHtcbiAgY29uc3QgeCA9IG5bMF0gKiB0WzBdICsgblsxXSAqIHRbMV07XG4gIGNvbnN0IHkgPSBuWzBdICogdFszXSArIG5bMV0gKiB0WzRdO1xuICBuWzBdID0geDtcbiAgblsxXSA9IHk7XG59XG5cbmV4cG9ydCB7XG4gIHRyYW5zZm9ybUNvbXBvc2UsXG4gIHRyYW5zZm9ybUlkZW50aXR5Q3JlYXRlLFxuICB0cmFuc2Zvcm1JbnZlcnQsXG4gIHRyYW5zZm9ybU11dGF0ZU5vcm1hbCxcbiAgdHJhbnNmb3JtTXV0YXRlUG9pbnQsXG4gIHRyYW5zZm9ybU5vcm1hbCxcbiAgdHJhbnNmb3JtUG9pbnQsXG4gIHRyYW5zZm9ybVNjYWxlLFxuICB0cmFuc2Zvcm1TY2FsZUNyZWF0ZSxcbiAgdHJhbnNmb3JtU3RyZXRjaCxcbiAgdHJhbnNmb3JtU3RyZXRjaENyZWF0ZSxcbiAgdHJhbnNmb3JtVHJhbnNsYXRlLFxuICB0cmFuc2Zvcm1UcmFuc2xhdGVDcmVhdGUsXG4gIHRyYW5zZm9ybVJvdGF0ZSxcbiAgdHJhbnNmb3JtUm90YXRlQ3JlYXRlLFxufTtcbiJdfQ==