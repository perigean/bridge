// Copyright Charles Dueck 2020
import { pointDistance } from "./point.js";
//import { Euler } from "./euler.js";
import { RungeKutta4 } from "./rk4.js";
export function trussMethod(truss) {
    const mobilePins = truss.mobilePins;
    const pins = truss.pins;
    if (mobilePins <= 0 || mobilePins >= pins.length) {
        throw new Error("Invalid mobilePins");
    }
    // State accessors
    function getdx(y, pin) {
        if (pin < mobilePins) {
            return y[pin * 2 + 0];
        }
        else {
            return pins[pin][0];
        }
    }
    function getdy(y, pin) {
        if (pin < mobilePins) {
            return y[pin * 2 + 1];
        }
        else {
            return pins[pin][1];
        }
    }
    function getvx(y, pin) {
        if (pin < mobilePins) {
            return y[mobilePins * 2 + pin * 2 + 0];
        }
        else {
            return 0.0;
        }
    }
    function getvy(y, pin) {
        if (pin < mobilePins) {
            return y[mobilePins * 2 + pin * 2 + 1];
        }
        else {
            return 0;
        }
    }
    function setdx(y, pin, val) {
        if (pin < mobilePins) {
            y[pin * 2 + 0] = val;
        }
    }
    function setdy(y, pin, val) {
        if (pin < mobilePins) {
            y[pin * 2 + 1] = val;
        }
    }
    function setvx(y, pin, val) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 0] = val;
        }
    }
    function setvy(y, pin, val) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 1] = val;
        }
    }
    function addvx(y, pin, val) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 0] += val;
        }
    }
    function addvy(y, pin, val) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 1] += val;
        }
    }
    // Split beam mass evenly between pins, initialise beam length.
    const materials = truss.materials;
    const mass = new Float32Array(mobilePins);
    function getm(pin) {
        if (pin < mobilePins) {
            return mass[pin];
        }
        else {
            return -1.0;
        }
    }
    const beams = truss.beams.map((beam) => {
        const p1 = beam.p1;
        const p2 = beam.p2;
        const l = pointDistance(pins[p1], pins[p2]);
        const m = l * beam.w * materials[beam.m].density;
        if (p1 < mobilePins) {
            mass[p1] += m * 0.5;
        }
        if (p2 < mobilePins) {
            mass[p2] += m * 0.5;
        }
        return { p1, p2, m: beam.m, w: beam.w, l: beam.l || l };
    });
    // Set up initial ODE state vector.
    const y0 = new Float32Array(mobilePins * 4);
    for (let i = 0; i < mobilePins; i++) {
        setdx(y0, i, pins[i][0]);
        setdy(y0, i, pins[i][1]);
    }
    // NB: Initial velocities are all 0, no need to initialize.
    const g = truss.g;
    return new RungeKutta4(y0, function (_t, y, dydt) {
        // Derivative of position is velocity.
        for (let i = 0; i < mobilePins; i++) {
            setdx(dydt, i, getvx(y, i));
            setdy(dydt, i, getvy(y, i));
        }
        // Acceleration due to gravity.
        for (let i = 0; i < mobilePins; i++) {
            setvx(dydt, i, g[0]);
            setvy(dydt, i, g[1]);
        }
        // Acceleration due to beam stress.
        for (const beam of beams) {
            const E = materials[beam.m].E;
            const p1 = beam.p1;
            const p2 = beam.p2;
            const w = beam.w;
            const l0 = beam.l;
            const dx = getdx(y, p2) - getdx(y, p1);
            const dy = getdy(y, p2) - getdy(y, p1);
            const l = Math.sqrt(dx * dx + dy * dy);
            //const strain = (l - l0) / l0;
            //const stress = strain * E * w;
            const k = E * w / l0;
            const springF = (l - l0) * k;
            const m1 = getm(p1); // Pin mass
            const m2 = getm(p2);
            const ux = dx / l; // Unit vector in directino of beam;
            const uy = dy / l;
            // Beam stress force.
            addvx(dydt, p1, ux * springF / m1);
            addvy(dydt, p1, uy * springF / m1);
            addvx(dydt, p2, -ux * springF / m2);
            addvy(dydt, p2, -uy * springF / m2);
            // Damping force.
            const zeta = 0.5;
            const vx = getvx(y, p2) - getvx(y, p1); // Velocity of p2 relative to p1.
            const vy = getvy(y, p2) - getvy(y, p1);
            const v = vx * ux + vy * uy; // Velocity of p2 relative to p1 in direction of beam.
            if (p1 < mobilePins && p2 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m1 * m2 / (m1 + m2));
                addvx(dydt, p1, ux * dampF / m1);
                addvy(dydt, p1, uy * dampF / m1);
                addvx(dydt, p2, -ux * dampF / m2);
                addvy(dydt, p2, -uy * dampF / m2);
            }
            else if (p1 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m1);
                addvx(dydt, p1, ux * dampF / m1);
                addvy(dydt, p1, uy * dampF / m1);
            }
            else if (p2 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m2);
                addvx(dydt, p2, -ux * dampF / m2);
                addvy(dydt, p2, -uy * dampF / m2);
            }
        }
    });
}
export function trussRenderer(truss) {
    const pins = truss.pins;
    const beams = truss.beams;
    const materials = truss.materials;
    const mobilePins = truss.mobilePins;
    return function (ctx, ode) {
        const y = ode.y;
        for (const beam of beams) {
            ctx.strokeStyle = materials[beam.m].style;
            ctx.lineWidth = beam.w;
            ctx.beginPath();
            const p1 = beam.p1;
            if (p1 < mobilePins) {
                ctx.moveTo(y[p1 * 2 + 0], y[p1 * 2 + 1]);
            }
            else {
                const pin = pins[p1];
                ctx.moveTo(pin[0], pin[1]);
            }
            const p2 = beam.p2;
            if (p2 < mobilePins) {
                ctx.lineTo(y[p2 * 2 + 0], y[p2 * 2 + 1]);
            }
            else {
                const pin = pins[p2];
                ctx.lineTo(pin[0], pin[1]);
            }
            ctx.stroke();
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHJ1c3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFcEQscUNBQXFDO0FBQ3JDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFrQ3ZDLE1BQU0sVUFBVSxXQUFXLENBQUMsS0FBWTtJQUNwQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDO0lBQ3BDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDeEIsSUFBSSxVQUFVLElBQUksQ0FBQyxJQUFJLFVBQVUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1FBQzlDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBQztLQUN6QztJQUVELGtCQUFrQjtJQUNsQixTQUFTLEtBQUssQ0FBQyxDQUFlLEVBQUUsR0FBVztRQUN2QyxJQUFJLEdBQUcsR0FBRyxVQUFVLEVBQUU7WUFDbEIsT0FBTyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztTQUN6QjthQUFNO1lBQ0gsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDdkI7SUFDTCxDQUFDO0lBQ0QsU0FBUyxLQUFLLENBQUMsQ0FBZSxFQUFFLEdBQVc7UUFDdkMsSUFBSSxHQUFHLEdBQUcsVUFBVSxFQUFFO1lBQ2xCLE9BQU8sQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7U0FDekI7YUFBTTtZQUNILE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3ZCO0lBQ0wsQ0FBQztJQUNELFNBQVMsS0FBSyxDQUFDLENBQWUsRUFBRSxHQUFXO1FBQ3ZDLElBQUksR0FBRyxHQUFHLFVB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LEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDNUM7aUJBQU07Z0JBQ0gsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNyQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUM5QjtZQUNELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDbkIsSUFBSSxFQUFFLEdBQUcsVUFBVSxFQUFFO2dCQUNqQixHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDNUM7aUJBQU07Z0JBQ0gsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNyQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUM5QjtZQUNELEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztTQUNoQjtJQUNMLENBQUMsQ0FBQTtBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEdWVjayAyMDIwXG5cbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi9wb2ludC5qc1wiO1xuaW1wb3J0IHsgT0RFTWV0aG9kIH0gZnJvbSBcIi4vb2RlLmpzXCI7XG4vL2ltcG9ydCB7IEV1bGVyIH0gZnJvbSBcIi4vZXVsZXIuanNcIjtcbmltcG9ydCB7IFJ1bmdlS3V0dGE0IH0gZnJvbSBcIi4vcms0LmpzXCI7XG5cbmV4cG9ydCB0eXBlIEJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjsgLy8gSW5kZXggb2YgcGluIGF0IGJlZ2lubmluZyBvZiBiZWFtLlxuICAgIHAyOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBlbmQgb2YgYmVhbS5cbiAgICBtOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtYXRlcmlhbCBvZiBiZWFtLlxuICAgIHc6IG51bWJlcjsgIC8vIFdpZHRoIG9mIGJlYW0uXG4gICAgbD86IG51bWJlcjsgLy8gTGVuZ3RoIG9mIGJlYW0sIG9ubHkgc3BlY2lmaWVkIHdoZW4gcHJlLXN0cmFpbmluZy5cbn07XG5cbnR5cGUgU2ltdWxhdGlvbkJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjtcbiAgICBwMjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBNYXRlcmlhbCA9IHtcbiAgICBFOiBudW1iZXI7ICAvLyBZb3VuZydzIG1vZHVsdXMgaW4gUGEuXG4gICAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBrZy9tXjNcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIFxuICAgIC8vIFRPRE86IHdoZW4gc3R1ZmYgYnJlYWtzXG59O1xuXG5leHBvcnQgdHlwZSBUcnVzcyA9IHtcbiAgICBwaW5zOiBBcnJheTxQb2ludDJEPixcbiAgICBtb2JpbGVQaW5zOiBudW1iZXIsIC8vIFRoZSBudW1iZXIgb2YgcGlucyB3aGljaCBhcmUgbm90IGZpeGVkLlxuICAgIGJlYW1zOiBBcnJheTxCZWFtPixcbiAgICBtYXRlcmlhbHM6IEFycmF5PE1hdGVyaWFsPixcbiAgICBnOiBQb2ludDJELCAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHRydXNzTWV0aG9kKHRydXNzOiBUcnVzcyk6IE9ERU1ldGhvZCB7XG4gICAgY29uc3QgbW9iaWxlUGlucyA9IHRydXNzLm1vYmlsZVBpbnM7XG4gICAgY29uc3QgcGlucyA9IHRydXNzLnBpbnM7XG4gICAgaWYgKG1vYmlsZVBpbnMgPD0gMCB8fCBtb2JpbGVQaW5zID49IHBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgbW9iaWxlUGluc1wiKTtcbiAgICB9XG5cbiAgICAvLyBTdGF0ZSBhY2Nlc3NvcnNcbiAgICBmdW5jdGlvbiBnZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAwXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBwaW5zW3Bpbl1bMF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gcGluc1twaW5dWzFdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgcmV0dXJuIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgcmV0dXJuIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV07IFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICB5W3BpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSArPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkdnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFNwbGl0IGJlYW0gbWFzcyBldmVubHkgYmV0d2VlbiBwaW5zLCBpbml0aWFsaXNlIGJlYW0gbGVuZ3RoLlxuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBjb25zdCBtYXNzID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zKTtcbiAgICBmdW5jdGlvbiBnZXRtKHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXNzW3Bpbl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gLTEuMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJlYW1zID0gdHJ1c3MuYmVhbXMubWFwKChiZWFtOiBCZWFtKTogU2ltdWxhdGlvbkJlYW0gPT4ge1xuICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgY29uc3QgbCA9IHBvaW50RGlzdGFuY2UocGluc1twMV0sIHBpbnNbcDJdKTtcbiAgICAgICAgY29uc3QgbSA9IGwgKiBiZWFtLncgKiBtYXRlcmlhbHNbYmVhbS5tXS5kZW5zaXR5O1xuICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AxXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIG1hc3NbcDJdICs9IG0gKiAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcDEsIHAyLCBtOiBiZWFtLm0sIHc6IGJlYW0udywgbDogYmVhbS5sIHx8IGwgfTtcbiAgICB9KTtcblxuICAgIC8vIFNldCB1cCBpbml0aWFsIE9ERSBzdGF0ZSB2ZWN0b3IuXG4gICAgY29uc3QgeTAgPSBuZXcgRmxvYXQzMkFycmF5KG1vYmlsZVBpbnMgKiA0KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICBzZXRkeCh5MCwgaSwgcGluc1tpXVswXSk7XG4gICAgICAgIHNldGR5KHkwLCBpLCBwaW5zW2ldWzFdKTtcbiAgICB9XG4gICAgLy8gTkI6IEluaXRpYWwgdmVsb2NpdGllcyBhcmUgYWxsIDAsIG5vIG5lZWQgdG8gaW5pdGlhbGl6ZS5cblxuICAgIGNvbnN0IGcgPSAgdHJ1c3MuZztcbiAgICByZXR1cm4gbmV3IFJ1bmdlS3V0dGE0KHkwLCBmdW5jdGlvbiAoX3Q6IG51bWJlciwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBwb3NpdGlvbiBpcyB2ZWxvY2l0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldGR4KGR5ZHQsIGksIGdldHZ4KHksIGkpKTtcbiAgICAgICAgICAgIHNldGR5KGR5ZHQsIGksIGdldHZ5KHksIGkpKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBzZXR2eChkeWR0LCBpLCBnWzBdKTtcbiAgICAgICAgICAgIHNldHZ5KGR5ZHQsIGksIGdbMV0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gYmVhbSBzdHJlc3MuXG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY29uc3QgRSA9IG1hdGVyaWFsc1tiZWFtLm1dLkU7XG4gICAgICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICBjb25zdCB3ID0gYmVhbS53O1xuICAgICAgICAgICAgY29uc3QgbDAgPSBiZWFtLmw7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIHAyKSAtIGdldGR4KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgcDIpIC0gZ2V0ZHkoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgICAgICAvL2NvbnN0IHN0cmFpbiA9IChsIC0gbDApIC8gbDA7XG4gICAgICAgICAgICAvL2NvbnN0IHN0cmVzcyA9IHN0cmFpbiAqIEUgKiB3O1xuICAgICAgICAgICAgY29uc3QgayA9IEUgKiB3IC8gbDA7XG4gICAgICAgICAgICBjb25zdCBzcHJpbmdGID0gKGwgLSBsMCkgKiBrO1xuICAgICAgICAgICAgY29uc3QgbTEgPSBnZXRtKHAxKTsgICAgLy8gUGluIG1hc3NcbiAgICAgICAgICAgIGNvbnN0IG0yID0gZ2V0bShwMik7XG4gICAgICAgICAgICBjb25zdCB1eCA9IGR4IC8gbDsgICAgICAvLyBVbml0IHZlY3RvciBpbiBkaXJlY3Rpbm8gb2YgYmVhbTtcbiAgICAgICAgICAgIGNvbnN0IHV5ID0gZHkgLyBsO1xuXG4gICAgICAgICAgICAvLyBCZWFtIHN0cmVzcyBmb3JjZS5cbiAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIHNwcmluZ0YgLyBtMSk7XG4gICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBzcHJpbmdGIC8gbTEpO1xuICAgICAgICAgICAgYWRkdngoZHlkdCwgcDIsIC11eCAqIHNwcmluZ0YgLyBtMik7XG4gICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogc3ByaW5nRiAvIG0yKTtcblxuICAgICAgICAgICAgLy8gRGFtcGluZyBmb3JjZS5cbiAgICAgICAgICAgIGNvbnN0IHpldGEgPSAwLjU7XG4gICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIHAyKSAtIGdldHZ4KHksIHAxKTsgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEuXG4gICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIHAyKSAtIGdldHZ5KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IHYgPSB2eCAqIHV4ICsgdnkgKiB1eTsgICAgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEgaW4gZGlyZWN0aW9uIG9mIGJlYW0uXG4gICAgICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zICYmIHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xICogbTIgLyAobTEgKyBtMikpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUcnVzc1JlbmRlciB7XG4gICAgKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBvZGU6IE9ERU1ldGhvZCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cnVzc1JlbmRlcmVyKHRydXNzOiBUcnVzcyk6IFRydXNzUmVuZGVyIHtcbiAgICBjb25zdCBwaW5zID0gdHJ1c3MucGlucztcbiAgICBjb25zdCBiZWFtcyA9IHRydXNzLmJlYW1zO1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBjb25zdCBtb2JpbGVQaW5zID0gdHJ1c3MubW9iaWxlUGlucztcblxuICAgIHJldHVybiBmdW5jdGlvbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgb2RlOiBPREVNZXRob2QpIHtcbiAgICAgICAgY29uc3QgeSA9IG9kZS55O1xuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IG1hdGVyaWFsc1tiZWFtLm1dLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IGJlYW0udztcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgIGlmIChwMSA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHlbcDEgKiAyICsgMF0sIHlbcDEgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AxXTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHlbcDIgKiAyICsgMF0sIHlbcDIgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AyXTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgIH1cbn0iXX0=