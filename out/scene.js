// Copyright Charles Dueck 2020
import { pointDistance } from "./point.js";
//import { Euler } from "./euler.js";
import { RungeKutta4 } from "./rk4.js";
import { Box, Fill, Layer, Position, Relative } from "./ui/node.js";
// minPin returns the lowest pin ID, inclusive.
function minPin(truss) {
    return -truss.fixedPins.length;
}
// maxPin returns the highest pin ID, exclusive (so the number it returns is not a valid pin).
function maxPin(truss) {
    return truss.startPins.length + truss.editPins.length;
}
function getPin(truss, pin) {
    if (pin < -truss.fixedPins.length) {
        throw new Error(`Unkown pin index ${pin}`);
    }
    else if (pin < 0) {
        return truss.fixedPins[truss.fixedPins.length + pin];
    }
    else if (pin < truss.startPins.length) {
        return truss.startPins[pin];
    }
    else if (pin - truss.startPins.length < truss.editPins.length) {
        return truss.editPins[pin - truss.startPins.length];
    }
    else {
        throw new Error(`Unkown pin index ${pin}`);
    }
}
function drawTerrain(scene) {
    const terrain = scene.terrain;
    const hmap = terrain.hmap;
    const pitch = scene.width / (hmap.length - 1);
    return function (ctx, box, _ec, vp) {
        const left = vp.left - box.left;
        const right = left + vp.width;
        const begin = Math.max(Math.min(Math.floor(left / pitch), hmap.length - 1), 0);
        const end = Math.max(Math.min(Math.ceil(right / pitch), hmap.length - 1), 0);
        ctx.fillStyle = terrain.style;
        ctx.beginPath();
        ctx.moveTo(box.left, box.top + box.height);
        for (let i = begin; i <= end; i++) {
            ctx.lineTo(box.left + i * pitch, box.top + hmap[i]);
        }
        ctx.lineTo(box.left + box.width, box.top + box.height);
        ctx.closePath();
        ctx.fill();
    };
}
export function sceneMethod(scene) {
    const truss = scene.truss;
    const fixedPins = truss.fixedPins;
    const mobilePins = truss.startPins.length + truss.editPins.length;
    // State accessors
    function getdx(y, pin) {
        if (pin < 0) {
            return fixedPins[fixedPins.length + pin][0];
        }
        else {
            return y[pin * 2 + 0];
        }
    }
    function getdy(y, pin) {
        if (pin < 0) {
            return fixedPins[fixedPins.length + pin][1];
        }
        else {
            return y[pin * 2 + 1];
        }
    }
    function getvx(y, pin) {
        if (pin < 0) {
            return 0.0;
        }
        else {
            return y[mobilePins * 2 + pin * 2 + 0];
        }
    }
    function getvy(y, pin) {
        if (pin < 0) {
            return 0.0;
        }
        else {
            return y[mobilePins * 2 + pin * 2 + 1];
        }
    }
    function setdx(y, pin, val) {
        if (pin >= 0) {
            y[pin * 2 + 0] = val;
        }
    }
    function setdy(y, pin, val) {
        if (pin >= 0) {
            y[pin * 2 + 1] = val;
        }
    }
    function setvx(y, pin, val) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 0] = val;
        }
    }
    function setvy(y, pin, val) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 1] = val;
        }
    }
    function addvx(y, pin, val) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 0] += val;
        }
    }
    function addvy(y, pin, val) {
        if (pin >= 0) {
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
            return 5.972e24; // Mass of the Earth.
        }
    }
    const beams = [...truss.startBeams, ...truss.editBeams].map((beam) => {
        const p1 = beam.p1;
        const p2 = beam.p2;
        const l = pointDistance(getPin(truss, p1), getPin(truss, p2));
        const m = l * beam.w * materials[beam.m].density;
        if (p1 < mobilePins) {
            mass[p1] += m * 0.5;
        }
        if (p2 < mobilePins) {
            mass[p2] += m * 0.5;
        }
        return { p1, p2, m: beam.m, w: beam.w, l: beam.l || l, deck: beam.deck || false };
    });
    // Disc mass.
    const discs = scene.truss.discs;
    for (const disc of discs) {
        if (disc.p >= mobilePins) {
            throw new Error("Disc attached to non mobile pin");
        }
        mass[disc.p] += disc.r * disc.r * Math.PI * materials[disc.m].density;
    }
    // Check that everything that can move has some mass.
    for (let i = 0; i < mobilePins; i++) {
        if (mass[i] <= 0.0) {
            throw new Error(`Mobile pin ${i} has mass ${mass[i]} <= 0.0`);
        }
    }
    const pitch = scene.width / (scene.terrain.hmap.length - 1);
    const hmap = scene.terrain.hmap.map((h, i) => {
        if (i + 1 >= scene.terrain.hmap.length) {
            return {
                height: h,
                nx: 0.0,
                ny: 1.0,
                decks: [],
                deckCount: 0,
            };
        }
        const dy = scene.terrain.hmap[i + 1] - h;
        const l = Math.sqrt(dy * dy + pitch * pitch);
        return {
            height: h,
            nx: -dy / l,
            ny: pitch / l,
            decks: [],
            deckCount: 0,
        };
    });
    function resetDecks() {
        for (const h of hmap) {
            h.deckCount = 0;
        }
    }
    function addDeck(i, d) {
        if (i < 0 || i >= hmap.length) {
            return;
        }
        const h = hmap[i];
        h.decks[h.deckCount] = d;
        h.deckCount++;
    }
    const tFriction = scene.terrain.friction;
    // Set up initial ODE state vector.
    const y0 = new Float32Array(mobilePins * 4);
    for (let i = 0; i < mobilePins; i++) {
        const d = getPin(truss, i);
        setdx(y0, i, d[0]);
        setdy(y0, i, d[1]);
    }
    // NB: Initial velocities are all 0, no need to initialize.
    const g = scene.g;
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
        // Decks are updated in hmap in the below loop through beams, so clear the previous values.
        resetDecks();
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
            // TODO: now that getm returns mass of Earth for fixed pins, we don't need these different if clauses.
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
            // Add decks to accleration structure
            if (beam.deck) {
                const i1 = Math.floor(getdx(y, p1) / pitch);
                const i2 = Math.floor(getdx(y, p2) / pitch);
                const begin = Math.min(i1, i2);
                const end = Math.max(i1, i2);
                for (let i = begin; i <= end; i++) {
                    addDeck(i, beam);
                }
            }
        }
        // Acceleration due to terrain collision, scene border collision
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
            }
            else {
                const ti = Math.min(hmap.length - 1, Math.floor(dx / pitch));
                nx = hmap[ti].nx;
                ny = hmap[ti].ny;
                at *= -(nx * (dx - ti * pitch) + ny * (dy - hmap[ti].height));
            }
            if (at > 0.0) {
                addvx(dydt, i, nx * at);
                addvy(dydt, i, ny * at);
                // Friction.
                // Apply acceleration in proportion to at, in direction opposite of tangent projected velocity.
                // Cap acceleration by some fraction of velocity
                // TODO: take friction from beams too (just average beams going into pin?)
                const tx = ny;
                const ty = -nx;
                const tv = getvx(y, i) * tx + getvy(y, i) * ty;
                const af = Math.min(tFriction * at, Math.abs(tv * 100)) * (tv >= 0.0 ? -1.0 : 1.0);
                addvx(dydt, i, tx * af);
                addvy(dydt, i, ty * af);
            }
        }
        // Acceleration due to disc-deck collision.
        for (const disc of discs) {
            const r = disc.r;
            const dx = getdx(y, disc.p);
            // Loop through all hmap buckets that disc overlaps.
            const i1 = Math.floor((dx - r) / pitch);
            const i2 = Math.floor((dx + r) / pitch);
            for (let i = i1; i <= i2; i++) {
                if (i < 0 || i >= hmap.length) {
                    continue;
                }
                // Loop through all decks in those buckets.
                const decks = hmap[i].decks;
                const deckCount = hmap[i].deckCount;
                for (let j = 0; j < deckCount; j++) {
                    const deck = decks[j];
                    const dy = getdy(y, disc.p);
                    const x1 = getdx(y, deck.p1);
                    const y1 = getdy(y, deck.p1);
                    const x2 = getdx(y, deck.p2);
                    const y2 = getdy(y, deck.p2);
                    // Is collision happening?
                    const sx = x2 - x1; // Vector to end of deck (from start)
                    const sy = y2 - y1;
                    const cx = dx - x1; // Vector to centre of disc (from start of deck)
                    const cy = dy - y1;
                    const a = sx * sx + sy * sy;
                    const b = -2.0 * (cx * sx + cy * sy);
                    const c = cx * cx + cy * cy - r * r;
                    const D = b * b - 4.0 * a * c;
                    if (D <= 0.0) {
                        continue; // No Real solutions to intersection.
                    }
                    const rootD = Math.sqrt(D);
                    const t = -b / (2.0 * a);
                    let t1 = (-b - rootD) / (2.0 * a);
                    let t2 = (-b + rootD) / (2.0 * a);
                    if ((t1 <= 0.0 && t2 <= 0.0) || (t1 >= 1.0 && t2 >= 0.0)) {
                        continue; // Intersections are both before or after deck.
                    }
                    t1 = Math.max(t1, 0.0);
                    t2 = Math.min(t2, 1.0);
                    // Compute collision acceleration.
                    // Acceleration is proportional to area 'shadowed' in the disc by the intersecting deck.
                    // This is so that as a disc moves between two deck segments, the acceleration remains constant.
                    const t1x = (1 - t1) * x1 + t1 * x2 - dx; // Circle centre -> t1 intersection.
                    const t1y = (1 - t1) * y1 + t1 * y2 - dy;
                    const t2x = (1 - t2) * x1 + t2 * x2 - dx; // Circle centre -> t2 intersection.
                    const t2y = (1 - t2) * y1 + t2 * y2 - dy;
                    const ta = Math.abs(Math.atan2(t1y, t1x) - Math.atan2(t2y, t2x)) % Math.PI;
                    const area = 0.5 * r * r * ta - 0.5 * Math.abs(t1x * t2y - t1y * t2x);
                    const an = 1000.0 * area; // TODO: figure out what acceleration to use
                    let nx = cx - sx * t;
                    let ny = cy - sy * t;
                    const l = Math.sqrt(nx * nx + ny * ny);
                    nx /= l;
                    ny /= l;
                    // Apply accelerations to the disc.
                    const md = getm(disc.p);
                    const m1 = getm(deck.p1) * (1.0 - t);
                    const m2 = getm(deck.p2) * t;
                    const ad = (m1 + m2) / (md + m1 + m2); // Share of acceleration for disc, deck endpoints.
                    const a1 = (md + m2) / (md + m1 + m2) * (1.0 - t);
                    const a2 = (md + m1) / (md + m1 + m2) * t;
                    addvx(dydt, disc.p, nx * an * ad);
                    addvy(dydt, disc.p, ny * an * ad);
                    // apply accleration distributed to pins
                    addvx(dydt, deck.p1, -nx * an * a1);
                    addvy(dydt, deck.p1, -ny * an * a1);
                    addvx(dydt, deck.p2, -nx * an * a2);
                    addvy(dydt, deck.p2, -ny * an * a2);
                    // Compute friction and damping.
                    // Get relative velocity.
                    const vx = getvx(y, disc.p) - (1.0 - t) * getvx(y, deck.p1) - t * getvx(y, deck.p2);
                    const vy = getvy(y, disc.p) - (1.0 - t) * getvy(y, deck.p1) - t * getvy(y, deck.p2);
                    const vn = vx * nx + vy * ny;
                    const tx = ny;
                    const ty = -nx;
                    const vt = vx * tx + vy * ty - disc.v;
                    // Totally unscientific way to compute friction from arbitrary constants.
                    const friction = Math.sqrt(materials[disc.m].friction * materials[deck.m].friction);
                    const af = Math.min(an * friction, Math.abs(vt * 100)) * (vt <= 0.0 ? 1.0 : -1.0);
                    const damp = 2; // TODO: figure out how to derive a reasonable constant.
                    addvx(dydt, disc.p, tx * af * ad - vn * nx * damp);
                    addvy(dydt, disc.p, ty * af * ad - vn * ny * damp);
                    // apply accleration distributed to pins
                    addvx(dydt, deck.p1, -tx * af * a1 + vn * nx * damp);
                    addvy(dydt, deck.p1, -ty * af * a1 + vn * ny * damp);
                    addvx(dydt, deck.p2, -tx * af * a2 + vn * nx * damp);
                    addvy(dydt, deck.p2, -ty * af * a2 + vn * ny * damp);
                }
            }
        }
    });
}
/*
export function sceneRenderer(scene: Scene): TrussRender {
    const truss = scene.truss;
    const materials = truss.materials;
    
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

        const y = ode.y;

        // Discs
        const discs = truss.discs;
        
        ctx.fillStyle = "red";
        for (const disc of discs) {
            const p = disc.p;
            ctx.beginPath();
            ctx.arc(y[p * 2 + 0], y[p * 2 + 1], disc.r, 0.0, 2 * Math.PI);
            ctx.fill("nonzero");
        }

        // Beams.
        ctx.lineCap = "round";
        for (const beam of beams) {
            ctx.strokeStyle = materials[beam.m].style;
            ctx.lineWidth = beam.w;
            ctx.beginPath();
            const p1 = beam.p1;

            // TODO: figure out how to use ode accessors.
            // Wait, does that mean we need an ODE for a static scene?
            // Will need different methods.
            
            if (p1 < 0) {
                const p = getPin(truss, p1);
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
*/
function drawPin(ctx, box, _ec, _vp) {
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
}
function CreateBeamPin(truss, pin) {
    const p = getPin(truss, pin);
    return Position(p[0] - 8, p[1] - 8, 16, 16)
        .onDraw(drawPin);
}
function AddTrussLayer(scene) {
    const truss = scene.truss;
    const minp = minPin(truss);
    const maxp = maxPin(truss);
    const children = new Array(maxp - minp);
    for (let i = minp; i < maxp; i++) {
        children[i - minp] = CreateBeamPin(truss, i);
    }
    return Relative(...children).onDraw((ctx) => {
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "black";
    });
}
export function SceneElement(scene) {
    return Box(scene.width, scene.height, Layer(Fill().onDraw(drawTerrain(scene)), AddTrussLayer(scene)));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFcEQscUNBQXFDO0FBQ3JDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDdkMsT0FBTyxFQUFFLEdBQUcsRUFBa0IsSUFBSSxFQUFFLEtBQUssRUFBZ0YsUUFBUSxFQUFrQixRQUFRLEVBQUUsTUFBTSxjQUFjLENBQUM7QUE2Q2xMLCtDQUErQztBQUMvQyxTQUFTLE1BQU0sQ0FBQyxLQUFZO0lBQ3hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUNuQyxDQUFDO0FBRUQsOEZBQThGO0FBQzlGLFNBQVMsTUFBTSxDQUFDLEtBQVk7SUFDeEIsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztBQUMxRCxDQUFDO0FBRUQsU0FBUyxNQUFNLENBQUMsS0FBWSxFQUFFLEdBQVc7SUFDckMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUMvQixNQUFNLElBQUksS0FBSyxDQUFDLG9CQUFvQixHQUFHLEVBQUUsQ0FBQyxDQUFDO0tBQzlDO1NBQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFO1FBQ2hCLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQztLQUN4RDtTQUFNLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFO1FBQ3JDLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztLQUMvQjtTQUFNLElBQUksR0FBRyxHQUFHLEtBQUssQ0FB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O1FBQ3RCLEdBQUcsQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDO0lBQzlCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUVELE1BQU0sVUFBVSxZQUFZLENBQUMsS0FBWTtJQUNyQyxPQUFPLEdBQUcsQ0FDTixLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQ3pCLEtBQUssQ0FDRCxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQ2pDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FDdkIsQ0FDSixDQUFDO0FBQ04sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuL3BvaW50LmpzXCI7XG5pbXBvcnQgeyBPREVNZXRob2QgfSBmcm9tIFwiLi9vZGUuanNcIjtcbi8vaW1wb3J0IHsgRXVsZXIgfSBmcm9tIFwiLi9ldWxlci5qc1wiO1xuaW1wb3J0IHsgUnVuZ2VLdXR0YTQgfSBmcm9tIFwiLi9yazQuanNcIjtcbmltcG9ydCB7IEJveCwgRWxlbWVudENvbnRleHQsIEZpbGwsIExheWVyLCBMYXlvdXRCb3gsIExheW91dEhhc1dpZHRoQW5kSGVpZ2h0LCBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0LCBPbkRyYXdIYW5kbGVyLCBQb3NpdGlvbiwgUG9zaXRpb25MYXlvdXQsIFJlbGF0aXZlIH0gZnJvbSBcIi4vdWkvbm9kZS5qc1wiO1xuXG5leHBvcnQgdHlwZSBCZWFtID0ge1xuICAgIHAxOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBiZWdpbm5pbmcgb2YgYmVhbS5cbiAgICBwMjogbnVtYmVyOyAvLyBJbmRleCBvZiBwaW4gYXQgZW5kIG9mIGJlYW0uXG4gICAgbTogbnVtYmVyOyAgLy8gSW5kZXggb2YgbWF0ZXJpYWwgb2YgYmVhbS5cbiAgICB3OiBudW1iZXI7ICAvLyBXaWR0aCBvZiBiZWFtLlxuICAgIGw/OiBudW1iZXI7IC8vIExlbmd0aCBvZiBiZWFtLCBvbmx5IHNwZWNpZmllZCB3aGVuIHByZS1zdHJhaW5pbmcuXG4gICAgZGVjaz86IGJvb2xlYW47IC8vIElzIHRoaXMgYmVhbSBhIGRlY2s/IChkbyBkaXNjcyBjb2xsaWRlKVxufTtcblxudHlwZSBTaW11bGF0aW9uQmVhbSA9IHtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBsOiBudW1iZXI7XG4gICAgZGVjazogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgRGlzYyA9IHtcbiAgICBwOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtb3ZlYWJsZSBwaW4gdGhpcyBkaXNjIHN1cnJvdW5kcy5cbiAgICBtOiBudW1iZXI7ICAvLyBNYXRlcmlhbCBvZiBkaXNjLlxuICAgIHI6IG51bWJlcjsgIC8vIFJhZGl1cyBvZiBkaXNjLlxuICAgIHY6IG51bWJlcjsgIC8vIFZlbG9jaXR5IG9mIHN1cmZhY2Ugb2YgZGlzYyAoaW4gQ0NXIGRpcmVjdGlvbikuXG59O1xuXG5leHBvcnQgdHlwZSBNYXRlcmlhbCA9IHtcbiAgICBFOiBudW1iZXI7ICAvLyBZb3VuZydzIG1vZHVsdXMgaW4gUGEuXG4gICAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBrZy9tXjNcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgLy8gVE9ETzogd2hlbiBzdHVmZiBicmVha3MsIHdvcmsgaGFyZGVuaW5nLCBldGMuXG59O1xuXG5leHBvcnQgdHlwZSBUcnVzcyA9IHtcbiAgICBmaXhlZFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHN0YXJ0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgZWRpdFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHN0YXJ0QmVhbXM6IEFycmF5PEJlYW0+O1xuICAgIGVkaXRCZWFtczogQXJyYXk8QmVhbT47XG4gICAgZGlzY3M6IEFycmF5PERpc2M+O1xuICAgIG1hdGVyaWFsczogQXJyYXk8TWF0ZXJpYWw+O1xufTtcblxuLy8gbWluUGluIHJldHVybnMgdGhlIGxvd2VzdCBwaW4gSUQsIGluY2x1c2l2ZS5cbmZ1bmN0aW9uIG1pblBpbih0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDtcbn1cblxuLy8gbWF4UGluIHJldHVybnMgdGhlIGhpZ2hlc3QgcGluIElELCBleGNsdXNpdmUgKHNvIHRoZSBudW1iZXIgaXQgcmV0dXJucyBpcyBub3QgYSB2YWxpZCBwaW4pLlxuZnVuY3Rpb24gbWF4UGluKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIGdldFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKTogUG9pbnQyRCB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLmZpeGVkUGluc1t0cnVzcy5maXhlZFBpbnMubGVuZ3RoICsgcGluXTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IHRydXNzLnN0YXJ0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLnN0YXJ0UGluc1twaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIC0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZWRpdFBpbnNbcGluIC0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aF07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH1cbn1cblxuLypcbmZ1bmN0aW9uIGFzc2VydFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKSB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoIHx8IHBpbiA+PSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhc3NlcnRNYXRlcmlhbCh0cnVzczogVHJ1c3MsIG06IG51bWJlcikge1xuICAgIGlmIChtIDwgMCB8fCBtID49IHRydXNzLm1hdGVyaWFscy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1hdGVyaWFsIGluZGV4ICR7bX1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldENsb3Nlc3RQaW4odHJ1c3M6IFRydXNzLCBwOiBQb2ludDJELCBtYXhkOiBudW1iZXIsIGJlYW1TdGFydD86IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gICAgLy8gVE9ETzogYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXMuIFByb2JhYmx5IG9ubHkgbWF0dGVycyBvbmNlIHdlIGhhdmUgMTAwMHMgb2YgcGlucz9cbiAgICBjb25zdCBibG9jayA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGxldCByZXMgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHJlc2QgPSBtYXhkO1xuICAgIGlmIChiZWFtU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3Muc3RhcnRCZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgICAgIGlmIChiLnAxID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIucDIgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmZpeGVkUGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5maXhlZFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGkgLSB0cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5zdGFydFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3Muc3RhcnRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5lZGl0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5lZGl0UGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSArIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuKi9cbmV4cG9ydCB0eXBlIFRlcnJhaW4gPSB7XG4gICAgaG1hcDogQXJyYXk8bnVtYmVyPjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG59O1xuXG50eXBlIFNpbXVsYXRpb25ITWFwID0gQXJyYXk8e1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIG54OiBudW1iZXI7IC8vIE5vcm1hbCB1bml0IHZlY3Rvci5cbiAgICBueTogbnVtYmVyO1xuICAgIGRlY2tzOiBBcnJheTxTaW11bGF0aW9uQmVhbT47ICAgLy8gVXBkYXRlZCBldmVyeSBmcmFtZSwgYWxsIGRlY2tzIGFib3ZlIHRoaXMgc2VnbWVudC5cbiAgICBkZWNrQ291bnQ6IG51bWJlcjsgIC8vIE51bWJlciBvZiBpbmRpY2VzIGluIGRlY2tzIGJlaW5nIHVzZWQuXG59PjtcblxuLypcbnR5cGUgVHJ1c3NFZGl0ID0ge1xuICAgIGRvOiAodHJ1c3M6IFRydXNzKSA9PiB2b2lkO1xuICAgIHVuZG86ICh0cnVzczogVHJ1c3MpID0+IHZvaWQ7XG59O1xuXG5mdW5jdGlvbiBhZGRCZWFtKFxuICAgIHRydXNzOiBUcnVzcyxcbiAgICBwMTogbnVtYmVyLFxuICAgIHAyOiBudW1iZXIsXG4gICAgbTogbnVtYmVyLFxuICAgIHc6IG51bWJlcixcbiAgICBsPzogbnVtYmVyLFxuICAgIGRlY2s/OiBib29sZWFuLFxuKSB7XG4gICAgYXNzZXJ0UGluKHRydXNzLCBwMSk7XG4gICAgYXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgYXNzZXJ0TWF0ZXJpYWwodHJ1c3MsIG0pO1xuICAgIGlmICh3IDw9IDAuMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gd2lkdGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7d31gKTtcbiAgICB9XG4gICAgaWYgKGwgIT09IHVuZGVmaW5lZCAmJiBsIDw9IDAuMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gbGVuZ3RoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke2x9YCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgYmVhbSBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgaWYgKChwMSA9PT0gYmVhbS5wMSAmJiBwMiA9PT0gYmVhbS5wMikgfHwgKHAxID09PSBiZWFtLnAyICYmIHAyID09PSBiZWFtLnAxKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gJHtwMX0gYW5kICR7cDJ9IGFscmVhZHkgZXhpc3RzYCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBiZWFtIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgaWYgKChwMSA9PT0gYmVhbS5wMSAmJiBwMiA9PT0gYmVhbS5wMikgfHwgKHAxID09PSBiZWFtLnAyICYmIHAyID09PSBiZWFtLnAxKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gJHtwMX0gYW5kICR7cDJ9IGFscmVhZHkgZXhpc3RzYCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdHJ1c3MuZWRpdEJlYW1zLnB1c2goe3AxLCBwMiwgbSwgdywgbCwgZGVja30pO1xufVxuXG5mdW5jdGlvbiB1bmFkZEJlYW0oXG4gICAgdHJ1c3M6IFRydXNzLFxuICAgIHAxOiBudW1iZXIsXG4gICAgcDI6IG51bWJlcixcbiAgICBtOiBudW1iZXIsXG4gICAgdzogbnVtYmVyLFxuICAgIGw/OiBudW1iZXIsXG4gICAgZGVjaz86IGJvb2xlYW4sXG4pIHtcbiAgICBjb25zdCBiID0gdHJ1c3MuZWRpdEJlYW1zLnBvcCgpO1xuICAgIGlmIChiID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBiZWFtcyBleGlzdCcpO1xuICAgIH1cbiAgICBpZiAoYi5wMSAhPT0gcDEgfHwgYi5wMiAhPT0gcDIgfHwgYi5tICE9PSBtIHx8IGIudyAhPSB3IHx8IGIubCAhPT0gbCB8fCBiLmRlY2sgIT09IGRlY2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCZWFtIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhZGRCZWFtQWN0aW9uKFxuICAgIHAxOiBudW1iZXIsXG4gICAgcDI6IG51bWJlcixcbiAgICBtOiBudW1iZXIsXG4gICAgdzogbnVtYmVyLFxuICAgIGw/OiBudW1iZXIsXG4gICAgZGVjaz86IGJvb2xlYW4sXG4gICAgKTogVHJ1c3NFZGl0IHtcbiAgICByZXR1cm4ge1xuICAgICAgICBkbzogKHRydXNzOiBUcnVzcykgPT4ge1xuICAgICAgICAgICAgYWRkQmVhbSh0cnVzcywgcDEsIHAyLCBtLCB3LCBsLCBkZWNrKTtcbiAgICAgICAgfSxcbiAgICAgICAgdW5kbzogKHRydXNzOiBUcnVzcykgPT4ge1xuICAgICAgICAgICAgdW5hZGRCZWFtKHRydXNzLCBwMSwgcDIsIG0sIHcsIGwsIGRlY2spO1xuICAgICAgICB9LCBcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZFBpbih0cnVzczogVHJ1c3MsIHBpbjogUG9pbnQyRCkge1xuICAgIHRydXNzLmVkaXRQaW5zLnB1c2gocGluKTtcbn1cblxuZnVuY3Rpb24gdW5hZGRQaW4odHJ1c3M6IFRydXNzLCBwaW46IFBvaW50MkQpIHtcbiAgICBjb25zdCBwID0gdHJ1c3MuZWRpdFBpbnMucG9wKCk7XG4gICAgaWYgKHAgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHBpbnMgZXhpc3QnKTtcbiAgICB9XG4gICAgaWYgKHBbMF0gIT09IHBpblswXSB8fCBwWzFdICE9PSBwaW5bMV0pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQaW4gZG9lcyBub3QgbWF0Y2gnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZEJlYW1BbmRQaW5BY3Rpb24oXG4gICAgcDE6IG51bWJlcixcbiAgICBwMjogUG9pbnQyRCxcbiAgICBtOiBudW1iZXIsXG4gICAgdzogbnVtYmVyLFxuICAgIGw/OiBudW1iZXIsXG4gICAgZGVjaz86IGJvb2xlYW4sXG4gICAgKTogVHJ1c3NFZGl0IHtcbiAgICByZXR1cm4ge1xuICAgICAgICBkbzogKHRydXNzOiBUcnVzcykgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGluID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgICAgIGFkZFBpbih0cnVzcywgcDIpO1xuICAgICAgICAgICAgYWRkQmVhbSh0cnVzcywgcDEsIHBpbiwgbSwgdywgbCwgZGVjayk7XG4gICAgICAgIH0sXG4gICAgICAgIHVuZG86ICh0cnVzczogVHJ1c3MpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBpbiA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgdW5hZGRCZWFtKHRydXNzLCBwMSwgcGluLCBtLCB3LCBsLCBkZWNrKTtcbiAgICAgICAgICAgIHVuYWRkUGluKHRydXNzLCBwMik7XG4gICAgICAgIH0sIFxuICAgIH1cbn1cbiovXG5leHBvcnQgdHlwZSBTY2VuZSA9IHtcbiAgICB0cnVzczogVHJ1c3M7XG4gICAgdGVycmFpbjogVGVycmFpbjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGc6IFBvaW50MkQ7ICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG59XG5cbmZ1bmN0aW9uIGRyYXdUZXJyYWluKHNjZW5lOiBTY2VuZSk6IE9uRHJhd0hhbmRsZXIge1xuICAgIGNvbnN0IHRlcnJhaW4gPSBzY2VuZS50ZXJyYWluO1xuICAgIGNvbnN0IGhtYXAgPSB0ZXJyYWluLmhtYXA7XG4gICAgY29uc3QgcGl0Y2ggPSBzY2VuZS53aWR0aCAvIChobWFwLmxlbmd0aCAtIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICAgICAgY29uc3QgbGVmdCA9IHZwLmxlZnQgLSBib3gubGVmdDtcbiAgICAgICAgY29uc3QgcmlnaHQgPSBsZWZ0ICsgdnAud2lkdGg7XG4gICAgICAgIGNvbnN0IGJlZ2luID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5mbG9vcihsZWZ0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICAgICAgY29uc3QgZW5kID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5jZWlsKHJpZ2h0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHRlcnJhaW4uc3R5bGU7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyhib3gubGVmdCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgICAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBpICogcGl0Y2gsIGJveC50b3AgKyBobWFwW2ldKTtcbiAgICAgICAgfVxuICAgICAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgYm94LndpZHRoLCBib3gudG9wICsgYm94LmhlaWdodCk7XG4gICAgICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICAgICAgY3R4LmZpbGwoKTtcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2NlbmVNZXRob2Qoc2NlbmU6IFNjZW5lKTogT0RFTWV0aG9kIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIFxuICAgIGNvbnN0IGZpeGVkUGlucyA9IHRydXNzLmZpeGVkUGlucztcbiAgICBjb25zdCBtb2JpbGVQaW5zID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAvLyBTdGF0ZSBhY2Nlc3NvcnNcbiAgICBmdW5jdGlvbiBnZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbl1bMF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW5dWzFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDFdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDFdOyBcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVtwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0dngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXSArPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gU3BsaXQgYmVhbSBtYXNzIGV2ZW5seSBiZXR3ZWVuIHBpbnMsIGluaXRpYWxpc2UgYmVhbSBsZW5ndGguXG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGNvbnN0IG1hc3MgPSBuZXcgRmxvYXQzMkFycmF5KG1vYmlsZVBpbnMpO1xuICAgIGZ1bmN0aW9uIGdldG0ocGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgcmV0dXJuIG1hc3NbcGluXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiA1Ljk3MmUyNDsgICAgLy8gTWFzcyBvZiB0aGUgRWFydGguXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBiZWFtcyA9IFsuLi50cnVzcy5zdGFydEJlYW1zLCAuLi50cnVzcy5lZGl0QmVhbXNdLm1hcCgoYmVhbTogQmVhbSk6IFNpbXVsYXRpb25CZWFtID0+IHtcbiAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgIGNvbnN0IGwgPSBwb2ludERpc3RhbmNlKGdldFBpbih0cnVzcywgcDEpLCBnZXRQaW4odHJ1c3MsIHAyKSk7XG4gICAgICAgIGNvbnN0IG0gPSBsICogYmVhbS53ICogbWF0ZXJpYWxzW2JlYW0ubV0uZGVuc2l0eTtcbiAgICAgICAgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgbWFzc1twMV0gKz0gbSAqIDAuNTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AyXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHAxLCBwMiwgbTogYmVhbS5tLCB3OiBiZWFtLncsIGw6IGJlYW0ubCB8fCBsLCBkZWNrOiBiZWFtLmRlY2sgfHwgZmFsc2UgfTtcbiAgICB9KTtcblxuICAgIC8vIERpc2MgbWFzcy5cbiAgICBjb25zdCBkaXNjcyA9IHNjZW5lLnRydXNzLmRpc2NzO1xuICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICBpZiAoZGlzYy5wID49IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpc2MgYXR0YWNoZWQgdG8gbm9uIG1vYmlsZSBwaW5cIik7XG4gICAgICAgIH1cbiAgICAgICAgbWFzc1tkaXNjLnBdICs9IGRpc2MuciAqIGRpc2MuciAqIE1hdGguUEkgKiBtYXRlcmlhbHNbZGlzYy5tXS5kZW5zaXR5O1xuICAgIH1cblxuICAgIC8vIENoZWNrIHRoYXQgZXZlcnl0aGluZyB0aGF0IGNhbiBtb3ZlIGhhcyBzb21lIG1hc3MuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgaWYgKG1hc3NbaV0gPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vYmlsZSBwaW4gJHtpfSBoYXMgbWFzcyAke21hc3NbaV19IDw9IDAuMGApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcGl0Y2ggPSBzY2VuZS53aWR0aCAvIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgaG1hcDogU2ltdWxhdGlvbkhNYXAgPSBzY2VuZS50ZXJyYWluLmhtYXAubWFwKChoLCBpKSA9PiB7XG4gICAgICAgIGlmIChpICsgMSA+PSBzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgICAgICBueDogMC4wLFxuICAgICAgICAgICAgICAgIG55OiAxLjAsXG4gICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZHkgPSBzY2VuZS50ZXJyYWluLmhtYXBbaSArIDFdIC0gaDtcbiAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeSAqIGR5ICsgcGl0Y2ggKiBwaXRjaCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICBueDogLWR5IC8gbCxcbiAgICAgICAgICAgIG55OiBwaXRjaCAvIGwsXG4gICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgIH07XG4gICAgfSk7XG4gICAgZnVuY3Rpb24gcmVzZXREZWNrcygpIHtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGhtYXApIHtcbiAgICAgICAgICAgIGguZGVja0NvdW50ID0gMDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGREZWNrKGk6IG51bWJlciwgZDogU2ltdWxhdGlvbkJlYW0pIHtcbiAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBoID0gaG1hcFtpXTtcbiAgICAgICAgaC5kZWNrc1toLmRlY2tDb3VudF0gPSBkO1xuICAgICAgICBoLmRlY2tDb3VudCsrO1xuICAgIH1cbiAgICBjb25zdCB0RnJpY3Rpb24gPSBzY2VuZS50ZXJyYWluLmZyaWN0aW9uO1xuXG4gICAgLy8gU2V0IHVwIGluaXRpYWwgT0RFIHN0YXRlIHZlY3Rvci5cbiAgICBjb25zdCB5MCA9IG5ldyBGbG9hdDMyQXJyYXkobW9iaWxlUGlucyAqIDQpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBnZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICBzZXRkeCh5MCwgaSwgZFswXSk7XG4gICAgICAgIHNldGR5KHkwLCBpLCBkWzFdKTtcbiAgICB9XG4gICAgLy8gTkI6IEluaXRpYWwgdmVsb2NpdGllcyBhcmUgYWxsIDAsIG5vIG5lZWQgdG8gaW5pdGlhbGl6ZS5cblxuICAgIGNvbnN0IGcgPSAgc2NlbmUuZztcbiAgICByZXR1cm4gbmV3IFJ1bmdlS3V0dGE0KHkwLCBmdW5jdGlvbiAoX3Q6IG51bWJlciwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBwb3NpdGlvbiBpcyB2ZWxvY2l0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldGR4KGR5ZHQsIGksIGdldHZ4KHksIGkpKTtcbiAgICAgICAgICAgIHNldGR5KGR5ZHQsIGksIGdldHZ5KHksIGkpKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBzZXR2eChkeWR0LCBpLCBnWzBdKTtcbiAgICAgICAgICAgIHNldHZ5KGR5ZHQsIGksIGdbMV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGVja3MgYXJlIHVwZGF0ZWQgaW4gaG1hcCBpbiB0aGUgYmVsb3cgbG9vcCB0aHJvdWdoIGJlYW1zLCBzbyBjbGVhciB0aGUgcHJldmlvdXMgdmFsdWVzLlxuICAgICAgICByZXNldERlY2tzKCk7XG5cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBiZWFtIHN0cmVzcy5cbiAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBFID0gbWF0ZXJpYWxzW2JlYW0ubV0uRTtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGNvbnN0IHcgPSBiZWFtLnc7XG4gICAgICAgICAgICBjb25zdCBsMCA9IGJlYW0ubDtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgcDIpIC0gZ2V0ZHgoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBwMikgLSBnZXRkeSh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgICAgIC8vY29uc3Qgc3RyYWluID0gKGwgLSBsMCkgLyBsMDtcbiAgICAgICAgICAgIC8vY29uc3Qgc3RyZXNzID0gc3RyYWluICogRSAqIHc7XG4gICAgICAgICAgICBjb25zdCBrID0gRSAqIHcgLyBsMDtcbiAgICAgICAgICAgIGNvbnN0IHNwcmluZ0YgPSAobCAtIGwwKSAqIGs7XG4gICAgICAgICAgICBjb25zdCBtMSA9IGdldG0ocDEpOyAgICAvLyBQaW4gbWFzc1xuICAgICAgICAgICAgY29uc3QgbTIgPSBnZXRtKHAyKTtcbiAgICAgICAgICAgIGNvbnN0IHV4ID0gZHggLyBsOyAgICAgIC8vIFVuaXQgdmVjdG9yIGluIGRpcmVjdGlubyBvZiBiZWFtO1xuICAgICAgICAgICAgY29uc3QgdXkgPSBkeSAvIGw7XG5cbiAgICAgICAgICAgIC8vIEJlYW0gc3RyZXNzIGZvcmNlLlxuICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogc3ByaW5nRiAvIG0xKTtcbiAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIHNwcmluZ0YgLyBtMSk7XG4gICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogc3ByaW5nRiAvIG0yKTtcbiAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAyLCAtdXkgKiBzcHJpbmdGIC8gbTIpO1xuXG4gICAgICAgICAgICAvLyBEYW1waW5nIGZvcmNlLlxuICAgICAgICAgICAgY29uc3QgemV0YSA9IDAuNTtcbiAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgcDIpIC0gZ2V0dngoeSwgcDEpOyAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMS5cbiAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgcDIpIC0gZ2V0dnkoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgdiA9IHZ4ICogdXggKyB2eSAqIHV5OyAgICAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMSBpbiBkaXJlY3Rpb24gb2YgYmVhbS5cbiAgICAgICAgICAgIC8vIFRPRE86IG5vdyB0aGF0IGdldG0gcmV0dXJucyBtYXNzIG9mIEVhcnRoIGZvciBmaXhlZCBwaW5zLCB3ZSBkb24ndCBuZWVkIHRoZXNlIGRpZmZlcmVudCBpZiBjbGF1c2VzLlxuICAgICAgICAgICAgaWYgKHAxIDwgbW9iaWxlUGlucyAmJiBwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSAqIG0yIC8gKG0xICsgbTIpKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwMSA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBZGQgZGVja3MgdG8gYWNjbGVyYXRpb24gc3RydWN0dXJlXG4gICAgICAgICAgICBpZiAoYmVhbS5kZWNrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKGdldGR4KHksIHAxKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGJlZ2luID0gTWF0aC5taW4oaTEsIGkyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1heChpMSwgaTIpO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBhZGREZWNrKGksIGJlYW0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIHRlcnJhaW4gY29sbGlzaW9uLCBzY2VuZSBib3JkZXIgY29sbGlzaW9uXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGkpOyAvLyBQaW4gcG9zaXRpb24uXG4gICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGkpO1xuICAgICAgICAgICAgbGV0IGF0ID0gMTAwMC4wOyAvLyBBY2NlbGVyYXRpb24gcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgICAgICBsZXQgbng7IC8vIFRlcnJhaW4gdW5pdCBub3JtYWwuXG4gICAgICAgICAgICBsZXQgbnk7XG4gICAgICAgICAgICBpZiAoZHggPCAwLjApIHtcbiAgICAgICAgICAgICAgICBueCA9IDAuMDtcbiAgICAgICAgICAgICAgICBueSA9IDEuMDtcbiAgICAgICAgICAgICAgICBhdCAqPSAtKG54ICogKGR4IC0gMC4wKSArIG55ICogKGR5IC0gaG1hcFswXS5oZWlnaHQpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGkgPSBNYXRoLm1pbihobWFwLmxlbmd0aCAtIDEsIE1hdGguZmxvb3IoZHggLyBwaXRjaCkpO1xuICAgICAgICAgICAgICAgIG54ID0gaG1hcFt0aV0ubng7XG4gICAgICAgICAgICAgICAgbnkgPSBobWFwW3RpXS5ueTtcbiAgICAgICAgICAgICAgICBhdCAqPSAtKG54ICogKGR4IC0gdGkgKiBwaXRjaCkgKyBueSAqIChkeSAtIGhtYXBbdGldLmhlaWdodCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGF0ID4gMC4wKSB7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgaSwgbnggKiBhdCk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgaSwgbnkgKiBhdCk7XG4gICAgICAgICAgICAgICAgLy8gRnJpY3Rpb24uXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIGluIHByb3BvcnRpb24gdG8gYXQsIGluIGRpcmVjdGlvbiBvcHBvc2l0ZSBvZiB0YW5nZW50IHByb2plY3RlZCB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICAvLyBDYXAgYWNjZWxlcmF0aW9uIGJ5IHNvbWUgZnJhY3Rpb24gb2YgdmVsb2NpdHlcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0YWtlIGZyaWN0aW9uIGZyb20gYmVhbXMgdG9vIChqdXN0IGF2ZXJhZ2UgYmVhbXMgZ29pbmcgaW50byBwaW4/KVxuICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgY29uc3QgdHYgPSBnZXR2eCh5LCBpKSAqIHR4ICsgZ2V0dnkoeSwgaSkgKiB0eTtcbiAgICAgICAgICAgICAgICBjb25zdCBhZiA9IE1hdGgubWluKHRGcmljdGlvbiAqIGF0LCBNYXRoLmFicyh0diAqIDEwMCkpICogKHR2ID49IDAuMCA/IC0xLjAgOiAxLjApO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGksIHR4ICogYWYpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGksIHR5ICogYWYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZGlzYy1kZWNrIGNvbGxpc2lvbi5cbiAgICAgICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCByID0gZGlzYy5yO1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBkaXNjLnApO1xuICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBobWFwIGJ1Y2tldHMgdGhhdCBkaXNjIG92ZXJsYXBzLlxuICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKChkeCAtIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKChkeCArIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGkxOyBpIDw9IGkyOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBkZWNrcyBpbiB0aG9zZSBidWNrZXRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tzID0gaG1hcFtpXS5kZWNrcztcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNrQ291bnQgPSBobWFwW2ldLmRlY2tDb3VudDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRlY2tDb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY2sgPSBkZWNrc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBkaXNjLnApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB4MSA9IGdldGR4KHksIGRlY2sucDEpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB5MSA9IGdldGR5KHksIGRlY2sucDEpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB4MiA9IGdldGR4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB5MiA9IGdldGR5KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gSXMgY29sbGlzaW9uIGhhcHBlbmluZz9cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ggPSB4MiAtIHgxOyAvLyBWZWN0b3IgdG8gZW5kIG9mIGRlY2sgKGZyb20gc3RhcnQpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN5ID0geTIgLSB5MTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3ggPSBkeCAtIHgxOyAvLyBWZWN0b3IgdG8gY2VudHJlIG9mIGRpc2MgKGZyb20gc3RhcnQgb2YgZGVjaylcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3kgPSBkeSAtIHkxO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhID0gc3ggKiBzeCArIHN5ICogc3k7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGIgPSAtMi4wICogKGN4ICogc3ggKyBjeSAqIHN5KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYyA9IGN4ICogY3ggKyBjeSAqIGN5IC0gciAqIHI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IEQgPSBiICogYiAtIDQuMCAqIGEgKiBjO1xuICAgICAgICAgICAgICAgICAgICBpZiAoRCA8PSAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIE5vIFJlYWwgc29sdXRpb25zIHRvIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb290RCA9IE1hdGguc3FydChEKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IC1iIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgdDEgPSAoLWIgLSByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0MiA9ICgtYiArIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh0MSA8PSAwLjAgJiYgdDIgPD0gMC4wKSB8fCAodDEgPj0gMS4wICYmIHQyID49IDAuMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIEludGVyc2VjdGlvbnMgYXJlIGJvdGggYmVmb3JlIG9yIGFmdGVyIGRlY2suXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdDEgPSBNYXRoLm1heCh0MSwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgdDIgPSBNYXRoLm1pbih0MiwgMS4wKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGNvbGxpc2lvbiBhY2NlbGVyYXRpb24uXG4gICAgICAgICAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBpcyBwcm9wb3J0aW9uYWwgdG8gYXJlYSAnc2hhZG93ZWQnIGluIHRoZSBkaXNjIGJ5IHRoZSBpbnRlcnNlY3RpbmcgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBzbyB0aGF0IGFzIGEgZGlzYyBtb3ZlcyBiZXR3ZWVuIHR3byBkZWNrIHNlZ21lbnRzLCB0aGUgYWNjZWxlcmF0aW9uIHJlbWFpbnMgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQxeCA9ICgxIC0gdDEpICogeDEgKyB0MSAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MSBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQxeSA9ICgxIC0gdDEpICogeTEgKyB0MSAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeCA9ICgxIC0gdDIpICogeDEgKyB0MiAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MiBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeSA9ICgxIC0gdDIpICogeTEgKyB0MiAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhID0gTWF0aC5hYnMoTWF0aC5hdGFuMih0MXksIHQxeCkgLSBNYXRoLmF0YW4yKHQyeSwgdDJ4KSkgJSBNYXRoLlBJO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmVhID0gMC41ICogciAqIHIgKiB0YSAtIDAuNSAqIE1hdGguYWJzKHQxeCAqIHQyeSAtIHQxeSAqIHQyeCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuID0gMTAwMC4wICogYXJlYTsgICAvLyBUT0RPOiBmaWd1cmUgb3V0IHdoYXQgYWNjZWxlcmF0aW9uIHRvIHVzZVxuICAgICAgICAgICAgICAgICAgICBsZXQgbnggPSBjeCAtIHN4ICogdDtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG55ID0gY3kgLSBzeSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQobnggKiBueCArIG55ICogbnkpO1xuICAgICAgICAgICAgICAgICAgICBueCAvPSBsO1xuICAgICAgICAgICAgICAgICAgICBueSAvPSBsO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbnMgdG8gdGhlIGRpc2MuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1kID0gZ2V0bShkaXNjLnApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMSA9IGdldG0oZGVjay5wMSkgKiAoMS4wIC0gdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0yID0gZ2V0bShkZWNrLnAyKSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkID0gKG0xICsgbTIpIC8gKG1kICsgbTEgKyBtMik7ICAvLyBTaGFyZSBvZiBhY2NlbGVyYXRpb24gZm9yIGRpc2MsIGRlY2sgZW5kcG9pbnRzLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhMSA9IChtZCArIG0yKSAvIChtZCArIG0xICsgbTIpICogKDEuMCAtIHQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhMiA9IChtZCArIG0xKSAvIChtZCArIG0xICsgbTIpICogdDtcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGlzYy5wLCBueCAqIGFuICogYWQpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkaXNjLnAsIG55ICogYW4gKiBhZCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IGFjY2xlcmF0aW9uIGRpc3RyaWJ1dGVkIHRvIHBpbnNcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMSwgLW54ICogYW4gKiBhMSk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDEsIC1ueSAqIGFuICogYTEpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAyLCAtbnggKiBhbiAqIGEyKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMiwgLW55ICogYW4gKiBhMik7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBmcmljdGlvbiBhbmQgZGFtcGluZy5cbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IHJlbGF0aXZlIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eCh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eCh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBkaXNjLnApIC0gKDEuMCAtIHQpICogZ2V0dnkoeSwgZGVjay5wMSkgLSB0ICogZ2V0dnkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZuID0gdnggKiBueCArIHZ5ICogbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2dCA9IHZ4ICogdHggKyB2eSAqIHR5IC0gZGlzYy52O1xuICAgICAgICAgICAgICAgICAgICAvLyBUb3RhbGx5IHVuc2NpZW50aWZpYyB3YXkgdG8gY29tcHV0ZSBmcmljdGlvbiBmcm9tIGFyYml0cmFyeSBjb25zdGFudHMuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZyaWN0aW9uID0gTWF0aC5zcXJ0KG1hdGVyaWFsc1tkaXNjLm1dLmZyaWN0aW9uICogbWF0ZXJpYWxzW2RlY2subV0uZnJpY3Rpb24pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZiA9IE1hdGgubWluKGFuICogZnJpY3Rpb24sIE1hdGguYWJzKHZ0ICogMTAwKSkgKiAodnQgPD0gMC4wID8gMS4wIDogLTEuMCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhbXAgPSAyOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgaG93IHRvIGRlcml2ZSBhIHJlYXNvbmFibGUgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRpc2MucCwgdHggKiBhZiAqIGFkIC0gdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkaXNjLnAsIHR5ICogYWYgKiBhZCAtIHZuICogbnkgKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAxLCAtdHggKiBhZiAqIGExICsgdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAxLCAtdHkgKiBhZiAqIGExICsgdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAyLCAtdHggKiBhZiAqIGEyICsgdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAyLCAtdHkgKiBhZiAqIGEyICsgdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuLypcbmV4cG9ydCBmdW5jdGlvbiBzY2VuZVJlbmRlcmVyKHNjZW5lOiBTY2VuZSk6IFRydXNzUmVuZGVyIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBcbiAgICAvLyBQcmUtcmVuZGVyIHRlcnJhaW4uXG4gICAgY29uc3QgdGVycmFpbiA9IHNjZW5lLnRlcnJhaW47XG4gICAgY29uc3QgaG1hcCA9IHRlcnJhaW4uaG1hcDtcbiAgICBjb25zdCB0ZXJyYWluUGF0aCA9IG5ldyBQYXRoMkQoKTtcbiAgICB0ZXJyYWluUGF0aC5tb3ZlVG8oMC4wLCAwLjApO1xuICAgIGxldCB4ID0gMC4wO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG1hcC5sZW5ndGg7IGkrKykge1xuICAgICAgICB0ZXJyYWluUGF0aC5saW5lVG8oeCwgaG1hcFtpXSk7XG4gICAgICAgIHggKz0gdGVycmFpbi5waXRjaDtcbiAgICB9XG4gICAgdGVycmFpblBhdGgubGluZVRvKHggLSB0ZXJyYWluLnBpdGNoLCAwLjApO1xuICAgIHRlcnJhaW5QYXRoLmNsb3NlUGF0aCgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBvZGU6IE9ERU1ldGhvZCkge1xuICAgICAgICAvLyBUZXJyYWluLlxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICAgICAgY3R4LmZpbGwodGVycmFpblBhdGgpO1xuXG4gICAgICAgIGNvbnN0IHkgPSBvZGUueTtcblxuICAgICAgICAvLyBEaXNjc1xuICAgICAgICBjb25zdCBkaXNjcyA9IHRydXNzLmRpc2NzO1xuICAgICAgICBcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmVkXCI7XG4gICAgICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgcCA9IGRpc2MucDtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5hcmMoeVtwICogMiArIDBdLCB5W3AgKiAyICsgMV0sIGRpc2MuciwgMC4wLCAyICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjdHguZmlsbChcIm5vbnplcm9cIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCZWFtcy5cbiAgICAgICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gbWF0ZXJpYWxzW2JlYW0ubV0uc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYmVhbS53O1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuXG4gICAgICAgICAgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byB1c2Ugb2RlIGFjY2Vzc29ycy5cbiAgICAgICAgICAgIC8vIFdhaXQsIGRvZXMgdGhhdCBtZWFuIHdlIG5lZWQgYW4gT0RFIGZvciBhIHN0YXRpYyBzY2VuZT9cbiAgICAgICAgICAgIC8vIFdpbGwgbmVlZCBkaWZmZXJlbnQgbWV0aG9kcy5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHAxIDwgMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSBnZXRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHlbcDEgKiAyICsgMF0sIHlbcDEgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AxXTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHlbcDIgKiAyICsgMF0sIHlbcDIgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AyXTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiovXG5cbmZ1bmN0aW9uIGRyYXdQaW4oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCkge1xuICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIDEsIGJveC53aWR0aCAtIDIsIGJveC5oZWlnaHQgLSAyKTtcbn1cblxuZnVuY3Rpb24gQ3JlYXRlQmVhbVBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKTogUG9zaXRpb25MYXlvdXQge1xuICAgIGNvbnN0IHAgPSBnZXRQaW4odHJ1c3MsIHBpbik7XG4gICAgcmV0dXJuIFBvc2l0aW9uKHBbMF0gLSA4LCBwWzFdIC0gOCwgMTYsIDE2KVxuICAgICAgICAub25EcmF3KGRyYXdQaW4pO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc0xheWVyKHNjZW5lOiBTY2VuZSk6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHRydXNzID0gc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgbWlucCA9IG1pblBpbih0cnVzcyk7XG4gICAgY29uc3QgbWF4cCA9IG1heFBpbih0cnVzcyk7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBuZXcgQXJyYXk8UG9zaXRpb25MYXlvdXQ+KG1heHAgLSBtaW5wKTtcbiAgICBmb3IgKGxldCBpID0gbWlucDsgaSA8IG1heHA7IGkrKykge1xuICAgICAgICBjaGlsZHJlbltpIC0gbWlucF0gPSBDcmVhdGVCZWFtUGluKHRydXNzLCBpKTtcbiAgICB9XG4gICAgcmV0dXJuIFJlbGF0aXZlKC4uLmNoaWxkcmVuKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSA9PiB7XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgICAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gU2NlbmVFbGVtZW50KHNjZW5lOiBTY2VuZSk6IExheW91dEhhc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gQm94KFxuICAgICAgICBzY2VuZS53aWR0aCwgc2NlbmUuaGVpZ2h0LFxuICAgICAgICBMYXllcihcbiAgICAgICAgICAgIEZpbGwoKS5vbkRyYXcoZHJhd1RlcnJhaW4oc2NlbmUpKSxcbiAgICAgICAgICAgIEFkZFRydXNzTGF5ZXIoc2NlbmUpLFxuICAgICAgICApLFxuICAgICk7XG59XG4iXX0=