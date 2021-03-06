// Copyright Charles Dueck 2020
function addWithScale(x, s, y, out) {
    const n = x.length;
    for (let i = 0; i < n; i++) {
        out[i] = x[i] + s * y[i];
    }
    return out;
}
export class RungeKutta4 {
    constructor(y, derivative) {
        this.t = 0;
        this.y = y;
        this.k1 = new Float32Array(y.length);
        this.k2 = new Float32Array(y.length);
        this.k3 = new Float32Array(y.length);
        this.k4 = new Float32Array(y.length);
        this.scratch = new Float32Array(y.length);
        this.derivative = derivative;
    }
    next(h) {
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
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicms0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3JrNC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwrQkFBK0I7QUFJL0IsU0FBUyxZQUFZLENBQUMsQ0FBZSxFQUFFLENBQVMsRUFBRSxDQUFlLEVBQUUsR0FBaUI7SUFDaEYsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUNuQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ3hCLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUM1QjtJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ2YsQ0FBQztBQU9ELE1BQU0sT0FBTyxXQUFXO0lBVXBCLFlBQVksQ0FBZSxFQUFFLFVBQXNCO1FBQy9DLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxQyxJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBSSxDQUFDLENBQVM7UUFDVixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDakIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNuQixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ25CLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDbkIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNuQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzdCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDbkMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckIsVUFBVSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsRUFBRSxFQUFFLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsVUFBVSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsRUFBRSxFQUFFLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDbkIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN4QixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7U0FDakU7UUFDRCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNoQixDQUFDO0NBQ0o7QUFBQSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5pbXBvcnQgeyBPREVNZXRob2QsIERlcml2YXRpdmUgfSBmcm9tIFwiLi9vZGUuanNcIjtcblxuZnVuY3Rpb24gYWRkV2l0aFNjYWxlKHg6IEZsb2F0MzJBcnJheSwgczogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIG91dDogRmxvYXQzMkFycmF5KTogRmxvYXQzMkFycmF5IHtcbiAgICBjb25zdCBuID0geC5sZW5ndGg7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgb3V0W2ldID0geFtpXSArIHMgKiB5W2ldO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE9ERSB7XG4gICAgdDogbnVtYmVyO1xuICAgIHk6IEZsb2F0MzJBcnJheTtcbn1cblxuZXhwb3J0IGNsYXNzIFJ1bmdlS3V0dGE0IGltcGxlbWVudHMgT0RFTWV0aG9kIHtcbiAgICB0OiBudW1iZXI7XG4gICAgeTogRmxvYXQzMkFycmF5O1xuICAgIHByaXZhdGUgazE6IEZsb2F0MzJBcnJheTtcbiAgICBwcml2YXRlIGsyOiBGbG9hdDMyQXJyYXk7XG4gICAgcHJpdmF0ZSBrMzogRmxvYXQzMkFycmF5O1xuICAgIHByaXZhdGUgazQ6IEZsb2F0MzJBcnJheTtcbiAgICBwcml2YXRlIHNjcmF0Y2g6IEZsb2F0MzJBcnJheTtcbiAgICBwcml2YXRlIGRlcml2YXRpdmU6IERlcml2YXRpdmU7XG5cbiAgICBjb25zdHJ1Y3Rvcih5OiBGbG9hdDMyQXJyYXksIGRlcml2YXRpdmU6IERlcml2YXRpdmUpIHtcbiAgICAgICAgdGhpcy50ID0gMDtcbiAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgdGhpcy5rMSA9IG5ldyBGbG9hdDMyQXJyYXkoeS5sZW5ndGgpO1xuICAgICAgICB0aGlzLmsyID0gbmV3IEZsb2F0MzJBcnJheSh5Lmxlbmd0aCk7XG4gICAgICAgIHRoaXMuazMgPSBuZXcgRmxvYXQzMkFycmF5KHkubGVuZ3RoKTtcbiAgICAgICAgdGhpcy5rNCA9IG5ldyBGbG9hdDMyQXJyYXkoeS5sZW5ndGgpO1xuICAgICAgICB0aGlzLnNjcmF0Y2ggPSBuZXcgRmxvYXQzMkFycmF5KHkubGVuZ3RoKTtcbiAgICAgICAgdGhpcy5kZXJpdmF0aXZlID0gZGVyaXZhdGl2ZTtcbiAgICB9XG5cbiAgICBuZXh0KGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCB0ID0gdGhpcy50O1xuICAgICAgICBjb25zdCB5ID0gdGhpcy55O1xuICAgICAgICBjb25zdCBrMSA9IHRoaXMuazE7XG4gICAgICAgIGNvbnN0IGsyID0gdGhpcy5rMjtcbiAgICAgICAgY29uc3QgazMgPSB0aGlzLmszO1xuICAgICAgICBjb25zdCBrNCA9IHRoaXMuazQ7XG4gICAgICAgIGNvbnN0IHNjcmF0Y2ggPSB0aGlzLnNjcmF0Y2g7XG4gICAgICAgIGNvbnN0IGRlcml2YXRpdmUgPSB0aGlzLmRlcml2YXRpdmU7XG4gICAgICAgIGRlcml2YXRpdmUodCwgeSwgazEpO1xuICAgICAgICBkZXJpdmF0aXZlKHQgKyAwLjUgKiBoLCBhZGRXaXRoU2NhbGUoeSwgMC41ICogaCwgazEsIHNjcmF0Y2gpLCBrMik7XG4gICAgICAgIGRlcml2YXRpdmUodCArIDAuNSAqIGgsIGFkZFdpdGhTY2FsZSh5LCAwLjUgKiBoLCBrMiwgc2NyYXRjaCksIGszKTtcbiAgICAgICAgZGVyaXZhdGl2ZSh0ICsgaCwgYWRkV2l0aFNjYWxlKHksIGgsIGszLCBzY3JhdGNoKSwgazQpO1xuICAgICAgICBjb25zdCBuID0geS5sZW5ndGg7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICB5W2ldICs9IGggKiAoazFbaV0gKyAyLjAgKiBrMltpXSArIDIuMCAqIGszW2ldICsgazRbaV0pIC8gNi4wO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudCArPSBoO1xuICAgIH1cbn07XG4iXX0=