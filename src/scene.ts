// Copyright Charles Dueck 2020

import { Point2D, pointDistance } from "./point.js";
import { ODEMethod } from "./ode.js";
//import { Euler } from "./euler.js";
import { RungeKutta4 } from "./rk4.js";

export type Beam = {
    p1: number; // Index of pin at beginning of beam.
    p2: number; // Index of pin at end of beam.
    m: number;  // Index of material of beam.
    w: number;  // Width of beam.
    l?: number; // Length of beam, only specified when pre-straining.
};

type SimulationBeam = {
    p1: number;
    p2: number;
    m: number;
    w: number;
    l: number;
}

export type Material = {
    E: number;  // Young's modulus in Pa.
    density: number;    // kg/m^3
    style: string | CanvasGradient | CanvasPattern;
    
    // TODO: when stuff breaks
};

export type Truss = {
    pins: Array<Point2D>;
    mobilePins: number; // The number of pins which are not fixed.
    beams: Array<Beam>;
    materials: Array<Material>;
};

export type Terrain = {
    hmap: Array<number>;
    pitch: number;
    style: string | CanvasGradient | CanvasPattern;
};

type SimulationHMap = Array<{
    height: number;
    nx: number; // Normal unit vector.
    ny: number;
}>;

export type Scene = {
    truss: Truss;
    terrain: Terrain;
    height: number;
    // NB: Scene width is determined by terrain width.
    g: Point2D;  // Acceleration due to gravity.
}

export function sceneMethod(scene: Scene): ODEMethod {
    const truss = scene.truss;
    const mobilePins = truss.mobilePins;
    const pins = truss.pins;
    if (mobilePins <= 0 || mobilePins > pins.length) {
        throw new Error("Invalid mobilePins");
    }

    // State accessors
    function getdx(y: Float32Array, pin: number): number {
        if (pin < mobilePins) {
            return y[pin * 2 + 0];
        } else {
            return pins[pin][0];
        }
    }
    function getdy(y: Float32Array, pin: number): number {
        if (pin < mobilePins) {
            return y[pin * 2 + 1];
        } else {
            return pins[pin][1];
        }
    }
    function getvx(y: Float32Array, pin: number): number {
        if (pin < mobilePins) {
            return y[mobilePins * 2 + pin * 2 + 0];
        } else {
            return 0.0;
        }
    }
    function getvy(y: Float32Array, pin: number): number {
        if (pin < mobilePins) {
            return y[mobilePins * 2 + pin * 2 + 1]; 
        } else {
            return 0;
        }
    }
    function setdx(y: Float32Array, pin: number, val: number) {
        if (pin < mobilePins) {
            y[pin * 2 + 0] = val;
        }
    }
    function setdy(y: Float32Array, pin: number, val: number) {
        if (pin < mobilePins) {
            y[pin * 2 + 1] = val;
        }
    }
    function setvx(y: Float32Array, pin: number, val: number) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 0] = val;
        }
    }
    function setvy(y: Float32Array, pin: number, val: number) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 1] = val;
        }
    }
    function addvx(y: Float32Array, pin: number, val: number) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 0] += val;
        }
    }
    function addvy(y: Float32Array, pin: number, val: number) {
        if (pin < mobilePins) {
            y[mobilePins * 2 + pin * 2 + 1] += val;
        }
    }
    
    // Split beam mass evenly between pins, initialise beam length.
    const materials = truss.materials;
    const mass = new Float32Array(mobilePins);
    function getm(pin: number): number {
        if (pin < mobilePins) {
            return mass[pin];
        } else {
            return -1.0;
        }
    }

    const beams = truss.beams.map((beam: Beam): SimulationBeam => {
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

    const pitch = scene.terrain.pitch;
    const hmap: SimulationHMap = scene.terrain.hmap.map((h, i) => {
        if (i + 1 >= scene.terrain.hmap.length) {
            return {
                height: h,
                nx: 0.0,
                ny: 1.0,
            };
        }
        const dy = scene.terrain.hmap[i + 1] - h;
        const l = Math.sqrt(dy * dy + pitch * pitch);
        return {
            height: h,
            nx: -dy / l,
            ny: pitch / l,
        };
    });

    // Set up initial ODE state vector.
    const y0 = new Float32Array(mobilePins * 4);
    for (let i = 0; i < mobilePins; i++) {
        setdx(y0, i, pins[i][0]);
        setdy(y0, i, pins[i][1]);
    }
    // NB: Initial velocities are all 0, no need to initialize.

    const g =  scene.g;
    return new RungeKutta4(y0, function (_t: number, y: Float32Array, dydt: Float32Array) {
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
            const m1 = getm(p1);    // Pin mass
            const m2 = getm(p2);
            const ux = dx / l;      // Unit vector in directino of beam;
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
            const v = vx * ux + vy * uy;    // Velocity of p2 relative to p1 in direction of beam.
            if (p1 < mobilePins && p2 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m1 * m2 / (m1 + m2));
                addvx(dydt, p1, ux * dampF / m1);
                addvy(dydt, p1, uy * dampF / m1);
                addvx(dydt, p2, -ux * dampF / m2);
                addvy(dydt, p2, -uy * dampF / m2);
            } else if (p1 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m1);
                addvx(dydt, p1, ux * dampF / m1);
                addvy(dydt, p1, uy * dampF / m1);
            } else if (p2 < mobilePins) {
                const dampF = v * zeta * Math.sqrt(k * m2);
                addvx(dydt, p2, -ux * dampF / m2);
                addvy(dydt, p2, -uy * dampF / m2);
            }
        }
        // Acceleration due to terrain collision.
        for (let i = 0; i < mobilePins; i++) {
            const dx = getdx(y, i); // Pin position.
            const dy = getdy(y, i);
            let at = 1000.0; // Acceleration per metre of depth under terrain.
            let nx; // Terrain unit normal.
            let ny;
            if (dx < 0.0) {
                nx = 0.0;
                ny = 1.0;
                at *= -(nx * (dx - 0.0) + ny * (dy - hmap[0].height));
            } else {
                const ti = Math.min(hmap.length - 1, Math.floor(dx / pitch));
                nx = hmap[ti].nx;
                ny = hmap[ti].ny;
                at *= -(nx * (dx - ti * pitch) + ny * (dy - hmap[ti].height));
            }
            if (at > 0.0) {
                addvx(dydt, i, nx * at);
                addvy(dydt, i, ny * at);
                // TODO: friction.
                // Apply acceleration in proportion to at, in direction opposite of tangent projected velocity.
                // Cap acceleration (including from other sources) in direction of tangent to be less than some proportion of speed.
            }
        }
    });
}

export interface TrussRender {
    (ctx: CanvasRenderingContext2D, ode: ODEMethod): void;
}

export function sceneRenderer(scene: Scene): TrussRender {
    const truss = scene.truss;
    const pins = truss.pins;
    const beams = truss.beams;
    const materials = truss.materials;
    const mobilePins = truss.mobilePins;

    // Pre-render terrain.
    const terrain = scene.terrain;
    const hmap = terrain.hmap;
    const terrainPath = new Path2D();
    terrainPath.moveTo(0.0, 0.0);
    let x = 0.0;
    for (let i = 0; i < hmap.length; i++) {
        terrainPath.lineTo(x, hmap[i]);
        x += terrain.pitch;
    }
    terrainPath.lineTo(x - terrain.pitch, 0.0);
    terrainPath.closePath();

    return function(ctx: CanvasRenderingContext2D, ode: ODEMethod) {
        // Terrain.
        ctx.fillStyle = terrain.style;
        ctx.fill(terrainPath);

        // Beams.
        const y = ode.y;
        for (const beam of beams) {
            ctx.strokeStyle = materials[beam.m].style;
            ctx.lineWidth = beam.w;
            ctx.beginPath();
            const p1 = beam.p1;
            if (p1 < mobilePins) {
                ctx.moveTo(y[p1 * 2 + 0], y[p1 * 2 + 1]);
            } else {
                const pin = pins[p1];
                ctx.moveTo(pin[0], pin[1]);
            }
            const p2 = beam.p2;
            if (p2 < mobilePins) {
                ctx.lineTo(y[p2 * 2 + 0], y[p2 * 2 + 1]);
            } else {
                const pin = pins[p2];
                ctx.lineTo(pin[0], pin[1]);
            }
            ctx.stroke();
        }
    }
}
