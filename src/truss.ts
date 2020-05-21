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
    pins: Array<Point2D>,
    mobilePins: number, // The number of pins which are not fixed.
    beams: Array<Beam>,
    materials: Array<Material>,
    g: Point2D,  // Acceleration due to gravity.
};

export function trussMethod(truss: Truss): ODEMethod {
    const mobilePins = truss.mobilePins;
    const pins = truss.pins;
    if (mobilePins <= 0 || mobilePins >= pins.length) {
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
    
    // Split beam mass evenly between pins, initialise beam length.
    const materials = truss.materials;
    const mass = new Float32Array(mobilePins);
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

    // Set up initial ODE state vector.
    const y0 = new Float32Array(mobilePins * 4);
    for (let i = 0; i < mobilePins; i++) {
        y0[i * 2 + 0] = pins[i][0];
        y0[i * 2 + 1] = pins[i][1];
    }
    // NB: Initial velocities are all 0.

    const g =  truss.g;
    return new RungeKutta4(y0, function (_t: number, y: Float32Array, dydt: Float32Array) {
        // Derivative of position is velocity.
        for (let i = 0; i < mobilePins; i++) {
            dydt[i * 2 + 0] = y[mobilePins * 2 + i * 2 + 0];
            dydt[i * 2 + 1] = y[mobilePins * 2 + i * 2 + 1];
        }
        // Acceleration due to gravity.
        for (let i = 0; i < mobilePins; i++) {
            dydt[mobilePins * 2 + i * 2 + 0] = g[0];
            dydt[mobilePins * 2 + i * 2 + 1] = g[1];
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
            const strain = (l - l0) / l0;
            const stress = strain * E * w;
            if (p1 < mobilePins) {
                dydt[mobilePins * 2 + p1 * 2 + 0] += (dx * stress) / (l * mass[p1]);
                dydt[mobilePins * 2 + p1 * 2 + 1] += (dy * stress) / (l * mass[p1]);
            }
            if (p2 < mobilePins) {
                dydt[mobilePins * 2 + p2 * 2 + 0] -= (dx * stress) / (l * mass[p2]);
                dydt[mobilePins * 2 + p2 * 2 + 1] -= (dy * stress) / (l * mass[p2]);
            }
        }
    });
}

export interface TrussRender {
    (ctx: CanvasRenderingContext2D, ode: ODEMethod): void;
}

export function trussRenderer(truss: Truss): TrussRender {
    const pins = truss.pins;
    const beams = truss.beams;
    const materials = truss.materials;
    const mobilePins = truss.mobilePins;

    return function(ctx: CanvasRenderingContext2D, ode: ODEMethod) {
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