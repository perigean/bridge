// Copyright 2021 Charles Dueck
import { resizeFloat32Array } from "./ode.js";
export function getLength(y) {
    return y.length >> 2; // y.length / 4
}
export function getDx(y, i) {
    return y[i * 4];
}
export function getDy(y, i) {
    return y[i * 4 + 1];
}
export function getVx(y, i) {
    return y[i * 4 + 2];
}
export function getVy(y, i) {
    return y[i * 4 + 3];
}
export function applyForce(dydt, m, i, fx, fy) {
    if (fx === NaN || fy === NaN)
        throw new Error('NaN force');
    if (fx === Infinity || fy === Infinity)
        throw new Error('Infinity force');
    dydt[i * 4 + 2] += fx / m[i];
    dydt[i * 4 + 3] += fy / m[i];
    if (dydt[i * 4 + 2] === NaN || dydt[i * 4 + 2] === Infinity || dydt[i * 4 + 3] === NaN || dydt[i * 4 + 3] === Infinity)
        throw new Error('bad dydt');
    if (Math.abs(dydt[i * 4 + 2]) > 1000000000 || Math.abs(dydt[i * 4 + 3]) > 1000000000) {
        throw new Error("high v'");
    }
}
export function applyAcceleration(dydt, i, ax, ay) {
    if (ax === NaN || ay === NaN)
        throw new Error('NaN acceleration');
    if (ax === Infinity || ay === Infinity)
        throw new Error('Infinity acceleration');
    dydt[i * 4 + 2] += ax;
    dydt[i * 4 + 3] += ay;
    if (dydt[i * 4 + 2] === NaN || dydt[i * 4 + 2] === Infinity || dydt[i * 4 + 3] === NaN || dydt[i * 4 + 3] === Infinity)
        throw new Error('bad dydt');
    if (Math.abs(dydt[i * 4 + 2]) > 1000000000 || Math.abs(dydt[i * 4 + 3]) > 1000000000) {
        throw new Error("high v'");
    }
}
;
export class ParticleSim {
    constructor(odeCtor, init, g, dampk, force) {
        this.g = g;
        this.dampk = dampk;
        this.m = new Float32Array(init.length);
        const y = new Float32Array(init.length * 4);
        for (let i = 0; i < init.length; i++) {
            this.m[i] = init[i].m;
            y[i * 4 + 0] = init[i].d[0];
            y[i * 4 + 1] = init[i].d[1];
            const v = init[i].v;
            if (v !== undefined) {
                y[i * 4 + 2] = v[0];
                y[i * 4 + 3] = v[1];
            }
        }
        // TODO: Clear out init so we don't capture it in the lambdas below?
        const odeDerivative = (t, y, dydt) => {
            const length = this.m.length;
            const gx = this.g[0];
            const gy = this.g[1];
            const dampk = this.dampk;
            for (let i = 0; i < length; i++) {
                // Derivative of position is velocity.
                dydt[i * 4 + 0] = y[i * 4 + 2];
                dydt[i * 4 + 1] = y[i * 4 + 3];
                // Start derivative of velocity with acceleration due to gravity and damping.
                dydt[i * 4 + 2] = gx - dampk * y[i * 4 + 2];
                dydt[i * 4 + 3] = gy - dampk * y[i * 4 + 3];
            }
            // Apply all other forces (beyond gravity)
            force(t, y, this.m, dydt);
        };
        this.method = new odeCtor(y, odeDerivative);
    }
    save() {
        const m = this.m;
        const y = this.method.y;
        const s = new Float32Array(m.length + y.length);
        s.set(y, 0);
        s.set(m, y.length);
        return s;
    }
    restore(t, s) {
        if (s.length % 5 !== 0) {
            throw new Error('saved state length must be a multiple of 5');
        }
        const length = s.length / 5;
        this.method.restore(t, s.subarray(0, length * 4));
        this.m = resizeFloat32Array(this.m, length);
        this.m.set(s.subarray(length * 4, length * 5));
    }
    reset(i, m, dx, dy, vx, vy) {
        const y = this.method.y;
        console.log(`reset ${i} ${m} ${dx} ${dy} ${vx} ${vy}, old ${this.m[i]} ${y[i * 4]} ${y[i * 4 + 1]} ${y[i * 4 + 1]} ${y[i * 4 + 1]}`);
        this.m[i] = m;
        y[i * 4] = dx;
        y[i * 4 + 1] = dy;
        y[i * 4 + 2] = vx;
        y[i * 4 + 3] = vy;
    }
    add(m, dx, dy, vx, vy) {
        const i = this.m.length;
        console.log(`add ${i} ${m} ${dx} ${dy} ${vx || 0} ${vy || 0}`);
        this.m = resizeFloat32Array(this.m, i + 1);
        this.m[i] = m;
        this.method.add(dx, dy, vx || 0, vy || 0);
        return i;
    }
    get t() {
        return this.method.t;
    }
    next(h) {
        this.method.next(h);
    }
    length() {
        return this.m.length;
    }
    getM(i) {
        return this.m[i];
    }
    getDx(i) {
        return this.method.y[i * 4 + 0];
    }
    getDy(i) {
        return this.method.y[i * 4 + 1];
    }
    getVx(i) {
        return this.method.y[i * 4 + 2];
    }
    getVy(i) {
        return this.method.y[i * 4 + 3];
    }
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFydGljbGVzaW0uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvcGFydGljbGVzaW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFBb0Msa0JBQWtCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFTaEYsTUFBTSxVQUFVLFNBQVMsQ0FBQyxDQUFlO0lBQ3JDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBRyxlQUFlO0FBQzNDLENBQUM7QUFFRCxNQUFNLFVBQVUsS0FBSyxDQUFDLENBQWUsRUFBRSxDQUFTO0lBQzVDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNwQixDQUFDO0FBRUQsTUFBTSxVQUFVLEtBQUssQ0FBQyxDQUFlLEVBQUUsQ0FBUztJQUM1QyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3hCLENBQUM7QUFFRCxNQUFNLFVBQVUsS0FBSyxDQUFDLENBQWUsRUFBRSxDQUFTO0lBQzVDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDeEIsQ0FBQztBQUVELE1BQU0sVUFBVSxLQUFLLENBQUMsQ0FBZSxFQUFFLENBQVM7SUFDNUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN4QixDQUFDO0FBRUQsTUFBTSxVQUFVLFVBQVUsQ0FBQyxJQUFrQixFQUFFLENBQWUsRUFBRSxDQUFTLEVBQUUsRUFBVSxFQUFFLEVBQVU7SUFDN0YsSUFBSSxFQUFFLEtBQUssR0FBRyxJQUFJLEVBQUUsS0FBSyxHQUFHO1FBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUMzRCxJQUFJLEVBQUUsS0FBSyxRQUFRLElBQUksRUFBRSxLQUFLLFFBQVE7UUFBRSxNQUFNLElBQUksS0FB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LEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMxQyxPQUFPLENBQUMsQ0FBQztJQUNiLENBQUM7SUFDRCxJQUFJLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFDRCxJQUFJLENBQUMsQ0FBUztRQUNWLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFDRCxNQUFNO1FBQ0YsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN6QixDQUFDO0lBQ0QsSUFBSSxDQUFDLENBQVM7UUFDVixPQUFPLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckIsQ0FBQztJQUNELEtBQUssQ0FBQyxDQUFTO1FBQ1gsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFDRCxLQUFLLENBQUMsQ0FBUztRQUNYLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBQ0QsS0FBSyxDQUFDLENBQVM7UUFDWCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUNELEtBQUssQ0FBQyxDQUFTO1FBQ1gsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7Q0FDSjtBQUFBLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAyMSBDaGFybGVzIER1ZWNrXG5cbmltcG9ydCB7IER5bmFtaWNPREVDdG9yLCBEeW5hbWljT0RFTWV0aG9kLCByZXNpemVGbG9hdDMyQXJyYXkgfSBmcm9tIFwiLi9vZGUuanNcIjtcbmltcG9ydCB7IFBvaW50MkQgfSBmcm9tIFwiLi9wb2ludC5qc1wiO1xuXG5leHBvcnQgdHlwZSBQYXJ0aWNsZUluaXQgPSB7XG4gICAgZDogUG9pbnQyRDtcbiAgICB2PzogUG9pbnQyRDtcbiAgICBtOiBudW1iZXI7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGVuZ3RoKHk6IEZsb2F0MzJBcnJheSk6IG51bWJlciB7XG4gICAgcmV0dXJuIHkubGVuZ3RoID4+IDI7ICAgLy8geS5sZW5ndGggLyA0XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREeCh5OiBGbG9hdDMyQXJyYXksIGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHlbaSAqIDRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RHkoeTogRmxvYXQzMkFycmF5LCBpOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB5W2kgKiA0ICsgMV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWeCh5OiBGbG9hdDMyQXJyYXksIGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHlbaSAqIDQgKyAyXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZ5KHk6IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4geVtpICogNCArIDNdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlGb3JjZShkeWR0OiBGbG9hdDMyQXJyYXksIG06IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyLCBmeDogbnVtYmVyLCBmeTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKGZ4ID09PSBOYU4gfHwgZnkgPT09IE5hTikgdGhyb3cgbmV3IEVycm9yKCdOYU4gZm9yY2UnKTtcbiAgICBpZiAoZnggPT09IEluZmluaXR5IHx8IGZ5ID09PSBJbmZpbml0eSkgdGhyb3cgbmV3IEVycm9yKCdJbmZpbml0eSBmb3JjZScpO1xuICAgIGR5ZHRbaSo0KzJdICs9IGZ4IC8gbVtpXTtcbiAgICBkeWR0W2kqNCszXSArPSBmeSAvIG1baV07XG4gICAgaWYgKGR5ZHRbaSo0KzJdID09PSBOYU4gfHwgZHlkdFtpKjQrMl0gPT09IEluZmluaXR5IHx8IGR5ZHRbaSo0KzNdID09PSBOYU4gfHwgZHlkdFtpKjQrM10gPT09IEluZmluaXR5KSB0aHJvdyBuZXcgRXJyb3IoJ2JhZCBkeWR0Jyk7XG4gICAgaWYgKE1hdGguYWJzKGR5ZHRbaSo0KzJdKSA+IDEwMDAwMDAwMDAgfHwgTWF0aC5hYnMoZHlkdFtpKjQrM10pID4gMTAwMDAwMDAwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJoaWdoIHYnXCIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5QWNjZWxlcmF0aW9uKGR5ZHQ6IEZsb2F0MzJBcnJheSwgaTogbnVtYmVyLCBheDogbnVtYmVyLCBheTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKGF4ID09PSBOYU4gfHwgYXkgPT09IE5hTikgdGhyb3cgbmV3IEVycm9yKCdOYU4gYWNjZWxlcmF0aW9uJyk7XG4gICAgaWYgKGF4ID09PSBJbmZpbml0eSB8fCBheSA9PT0gSW5maW5pdHkpIHRocm93IG5ldyBFcnJvcignSW5maW5pdHkgYWNjZWxlcmF0aW9uJyk7XG4gICAgZHlkdFtpKjQrMl0gKz0gYXg7XG4gICAgZHlkdFtpKjQrM10gKz0gYXk7XG4gICAgaWYgKGR5ZHRbaSo0KzJdID09PSBOYU4gfHwgZHlkdFtpKjQrMl0gPT09IEluZmluaXR5IHx8IGR5ZHRbaSo0KzNdID09PSBOYU4gfHwgZHlkdFtpKjQrM10gPT09IEluZmluaXR5KSB0aHJvdyBuZXcgRXJyb3IoJ2JhZCBkeWR0Jyk7XG4gICAgaWYgKE1hdGguYWJzKGR5ZHRbaSo0KzJdKSA+IDEwMDAwMDAwMDAgfHwgTWF0aC5hYnMoZHlkdFtpKjQrM10pID4gMTAwMDAwMDAwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJoaWdoIHYnXCIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBQYXJ0aWNsZUZvcmNlIHtcbiAgICAodDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIG06IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KTogdm9pZDtcbn07XG5cbmV4cG9ydCBjbGFzcyBQYXJ0aWNsZVNpbSB7XG4gICAgcHJpdmF0ZSBnOiBQb2ludDJEO1xuICAgIHByaXZhdGUgZGFtcGs6IG51bWJlcjtcbiAgICBwcml2YXRlIG06IEZsb2F0MzJBcnJheTtcbiAgICBwcml2YXRlIG1ldGhvZDogRHluYW1pY09ERU1ldGhvZDxGbG9hdDMyQXJyYXk+O1xuXG4gICAgY29uc3RydWN0b3Iob2RlQ3RvcjogRHluYW1pY09ERUN0b3I8RmxvYXQzMkFycmF5PiwgaW5pdDogUGFydGljbGVJbml0W10sIGc6IFBvaW50MkQsIGRhbXBrOiBudW1iZXIsIGZvcmNlOiBQYXJ0aWNsZUZvcmNlKSB7XG4gICAgICAgIHRoaXMuZyA9IGc7XG4gICAgICAgIHRoaXMuZGFtcGsgPSBkYW1waztcbiAgICAgICAgdGhpcy5tID0gbmV3IEZsb2F0MzJBcnJheShpbml0Lmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IHkgPSBuZXcgRmxvYXQzMkFycmF5KGluaXQubGVuZ3RoICogNCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaW5pdC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5tW2ldID0gaW5pdFtpXS5tO1xuICAgICAgICAgICAgeVtpKjQrMF0gPSBpbml0W2ldLmRbMF07XG4gICAgICAgICAgICB5W2kqNCsxXSA9IGluaXRbaV0uZFsxXTtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBpbml0W2ldLnY7XG4gICAgICAgICAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgeVtpKjQrMl0gPSB2WzBdO1xuICAgICAgICAgICAgICAgIHlbaSo0KzNdID0gdlsxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRPRE86IENsZWFyIG91dCBpbml0IHNvIHdlIGRvbid0IGNhcHR1cmUgaXQgaW4gdGhlIGxhbWJkYXMgYmVsb3c/XG5cbiAgICAgICAgY29uc3Qgb2RlRGVyaXZhdGl2ZSA9ICh0OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KTogdm9pZCA9PiB7XG4gICAgICAgICAgICBjb25zdCBsZW5ndGggPSB0aGlzLm0ubGVuZ3RoO1xuICAgICAgICAgICAgY29uc3QgZ3ggPSB0aGlzLmdbMF07XG4gICAgICAgICAgICBjb25zdCBneSA9IHRoaXMuZ1sxXTtcbiAgICAgICAgICAgIGNvbnN0IGRhbXBrID0gdGhpcy5kYW1waztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgIGR5ZHRbaSo0KzBdID0geVtpKjQrMl07XG4gICAgICAgICAgICAgICAgZHlkdFtpKjQrMV0gPSB5W2kqNCszXTtcbiAgICAgICAgICAgICAgICAvLyBTdGFydCBkZXJpdmF0aXZlIG9mIHZlbG9jaXR5IHdpdGggYWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5IGFuZCBkYW1waW5nLlxuICAgICAgICAgICAgICAgIGR5ZHRbaSo0KzJdID0gZ3ggLSBkYW1wayAqIHlbaSo0KzJdO1xuICAgICAgICAgICAgICAgIGR5ZHRbaSo0KzNdID0gZ3kgLSBkYW1wayAqIHlbaSo0KzNdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gQXBwbHkgYWxsIG90aGVyIGZvcmNlcyAoYmV5b25kIGdyYXZpdHkpXG4gICAgICAgICAgICBmb3JjZSh0LCB5LCB0aGlzLm0sIGR5ZHQpO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm1ldGhvZCA9IG5ldyBvZGVDdG9yKHksIG9kZURlcml2YXRpdmUpO1xuICAgIH1cblxuICAgIHNhdmUoKTogRmxvYXQzMkFycmF5IHtcbiAgICAgICAgY29uc3QgbSA9IHRoaXMubTtcbiAgICAgICAgY29uc3QgeSA9IHRoaXMubWV0aG9kLnk7XG4gICAgICAgIGNvbnN0IHMgPSBuZXcgRmxvYXQzMkFycmF5KG0ubGVuZ3RoICsgeS5sZW5ndGgpO1xuICAgICAgICBzLnNldCh5LCAwKTtcbiAgICAgICAgcy5zZXQobSwgeS5sZW5ndGgpO1xuICAgICAgICByZXR1cm4gcztcbiAgICB9XG5cbiAgICByZXN0b3JlKHQ6IG51bWJlciwgczogRmxvYXQzMkFycmF5KTogdm9pZCB7XG4gICAgICAgIGlmIChzLmxlbmd0aCAlIDUgIT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignc2F2ZWQgc3RhdGUgbGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA1Jyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbGVuZ3RoID0gcy5sZW5ndGggLyA1O1xuICAgICAgICB0aGlzLm1ldGhvZC5yZXN0b3JlKHQsIHMuc3ViYXJyYXkoMCwgbGVuZ3RoICogNCkpO1xuICAgICAgICB0aGlzLm0gPSByZXNpemVGbG9hdDMyQXJyYXkodGhpcy5tLCBsZW5ndGgpO1xuICAgICAgICB0aGlzLm0uc2V0KHMuc3ViYXJyYXkobGVuZ3RoICogNCwgbGVuZ3RoICogNSkpO1xuICAgIH1cblxuICAgIHJlc2V0KGk6IG51bWJlciwgbTogbnVtYmVyLCBkeDogbnVtYmVyLCBkeTogbnVtYmVyLCB2eDogbnVtYmVyLCB2eTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHkgPSB0aGlzLm1ldGhvZC55O1xuICAgICAgICBjb25zb2xlLmxvZyhgcmVzZXQgJHtpfSAke219ICR7ZHh9ICR7ZHl9ICR7dnh9ICR7dnl9LCBvbGQgJHt0aGlzLm1baV19ICR7eVtpKjRdfSAke3lbaSo0KzFdfSAke3lbaSo0KzFdfSAke3lbaSo0KzFdfWApO1xuICAgICAgICB0aGlzLm1baV0gPSBtO1xuICAgICAgICB5W2kgKiA0XSA9IGR4O1xuICAgICAgICB5W2kgKiA0ICsgMV0gPSBkeTtcbiAgICAgICAgeVtpICogNCArIDJdID0gdng7XG4gICAgICAgIHlbaSAqIDQgKyAzXSA9IHZ5O1xuICAgIH1cbiAgICBhZGQobTogbnVtYmVyLCBkeDogbnVtYmVyLCBkeTogbnVtYmVyLCB2eD86IG51bWJlciwgdnk/OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBjb25zdCBpID0gdGhpcy5tLmxlbmd0aDtcbiAgICAgICAgY29uc29sZS5sb2coYGFkZCAke2l9ICR7bX0gJHtkeH0gJHtkeX0gJHt2eCB8fCAwfSAke3Z5IHx8IDB9YCk7XG4gICAgICAgIHRoaXMubSA9IHJlc2l6ZUZsb2F0MzJBcnJheSh0aGlzLm0sIGkgKyAxKTtcbiAgICAgICAgdGhpcy5tW2ldID0gbTtcbiAgICAgICAgdGhpcy5tZXRob2QuYWRkKGR4LCBkeSwgdnggfHwgMCwgdnkgfHwgMCk7XG4gICAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgICBnZXQgdCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5tZXRob2QudDtcbiAgICB9XG4gICAgbmV4dChoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5tZXRob2QubmV4dChoKTtcbiAgICB9XG4gICAgbGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm0ubGVuZ3RoO1xuICAgIH1cbiAgICBnZXRNKGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm1baV07XG4gICAgfVxuICAgIGdldER4KGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm1ldGhvZC55W2kqNCswXTtcbiAgICB9XG4gICAgZ2V0RHkoaTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWV0aG9kLnlbaSo0KzFdO1xuICAgIH1cbiAgICBnZXRWeChpOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5tZXRob2QueVtpKjQrMl07XG4gICAgfVxuICAgIGdldFZ5KGk6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm1ldGhvZC55W2kqNCszXTtcbiAgICB9XG59OyJdfQ==