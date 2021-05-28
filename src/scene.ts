// Copyright Charles Dueck 2020

import { Point2D, pointDistance } from "./point.js";
//import { ODEMethod } from "./ode.js";
//import { Euler } from "./euler.js";
//import { RungeKutta4 } from "./rk4.js";
import { addChild, Bottom, Box, ElementContext, Fill, Flex, Layer, LayoutBox, LayoutTakesWidthAndHeight, Left, Mux, PanPoint, Position, PositionLayout, Relative, removeChild, Scroll } from "./ui/node.js";

export type Beam = {
    p1: number; // Index of pin at beginning of beam.
    p2: number; // Index of pin at end of beam.
    m: number;  // Index of material of beam.
    w: number;  // Width of beam.
    l?: number; // Length of beam, only specified when pre-straining.
    deck?: boolean; // Is this beam a deck? (do discs collide)
};

/*
type SimulationBeam = {
    p1: number;
    p2: number;
    m: number;
    w: number;
    l: number;
    deck: boolean;
}
*/

export type Disc = {
    p: number;  // Index of moveable pin this disc surrounds.
    m: number;  // Material of disc.
    r: number;  // Radius of disc.
    v: number;  // Velocity of surface of disc (in CCW direction).
};

export type Material = {
    E: number;  // Young's modulus in Pa.
    density: number;    // kg/m^3
    style: string | CanvasGradient | CanvasPattern;
    friction: number;
    // TODO: when stuff breaks, work hardening, etc.
};

export type Truss = {
    fixedPins: Array<Point2D>;
    startPins: Array<Point2D>;
    editPins: Array<Point2D>;
    startBeams: Array<Beam>;
    editBeams: Array<Beam>;
    discs: Array<Disc>;
    materials: Array<Material>;
};

export type Terrain = {
    hmap: Array<number>;
    friction: number;
    style: string | CanvasGradient | CanvasPattern;
};
/*
type SimulationHMap = Array<{
    height: number;
    nx: number; // Normal unit vector.
    ny: number;
    decks: Array<SimulationBeam>;   // Updated every frame, all decks above this segment.
    deckCount: number;  // Number of indices in decks being used.
}>;
*/

type AddBeamAction = {
    type: "add_beam";
    p1: number;
    p2: number;
    m: number;
    w: number;
    l?: number;
    deck?: boolean;
};

type AddPinAction = {
    type: "add_pin";
    pin: Point2D;
};

type CompositeAction = {
    type: "composite";
    actions: Array<TrussAction>;
};

type TrussAction = AddBeamAction | AddPinAction | CompositeAction;


export type SceneJSON = {
    truss: Truss;
    terrain: Terrain;
    height: number;
    width: number;
    g: Point2D;  // Acceleration due to gravity.
    redoStack: Array<TrussAction>;
    undoStack: Array<TrussAction>;
}

type OnAddPinHandler = (editIndex: number, pin: number, p: Point2D, ec: ElementContext) => void;
type OnRemovePinHandler = (editIndex: number, pin: number, ec: ElementContext) => void;


export class Scene {
    private scene: SceneJSON;
    private onAddPinHandlers: Array<OnAddPinHandler>;
    private onRemovePinHandlers: Array<OnRemovePinHandler>;
    private editMaterial: number;
    private editWidth: number;
    private editDeck: boolean;

    private assertPin(pin: number) {
        const truss = this.scene.truss;
        if (pin < -truss.fixedPins.length || pin >= truss.startPins.length + truss.editPins.length) {
            throw new Error(`Unknown pin index ${pin}`);
        }
    }
    
    private assertMaterial(m: number) {
        const materials = this.scene.truss.materials;
        if (m < 0 || m >= materials.length) {
            throw new Error(`Unknown material index ${m}`);
        }
    }

    private doAddBeam(a: AddBeamAction, ec: ElementContext) {
        const truss = this.scene.truss;
        const p1 = a.p1;
        const p2 = a.p2;
        const m = a.m;
        const w = a.w;
        const l = a.l;
        const deck = a.deck;
        this.assertPin(p1);
        this.assertPin(p2);
        this.assertMaterial(m);
        if (w <= 0.0) {
            throw new Error(`Beam width must be greater than 0, got ${w}`);
        }
        if (l !== undefined && l <= 0.0) {
            throw new Error(`Beam length must be greater than 0, got ${l}`);
        }
        if (this.beamExists(p1, p2)) {
            throw new Error(`Beam between pins ${p1} and ${p2} already exists`);
        }
        truss.editBeams.push({p1, p2, m, w, l, deck});
        
        ec.requestDraw();   // TODO: have listeners, and then the UI component can do the requestDraw()
    }
    
    private undoAddBeam(a: AddBeamAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const b = truss.editBeams.pop();
        if (b === undefined) {
            throw new Error('No beams exist');
        }
        if (b.p1 !== a.p1 || b.p2 !== a.p2 || b.m !== a.m || b.w != a.w || b.l !== a.l || b.deck !== a.deck) {
            throw new Error('Beam does not match');
        }
        ec.requestDraw();   // TODO: have listeners, and then the UI component can do the requestDraw()
    }

    private doAddPin(a: AddPinAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const editIndex = truss.editPins.length;
        const pin = truss.startPins.length + editIndex;
        truss.editPins.push(a.pin);
        for (const h of this.onAddPinHandlers) {
            h(editIndex, pin, a.pin, ec);
        }
    }

    private undoAddPin(a: AddPinAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const p = truss.editPins.pop();
        if (p === undefined) {
            throw new Error('No pins exist');
        }
        if (p[0] !== a.pin[0] || p[1] !== a.pin[1]) {
            throw new Error('Pin does not match');
        }
        const editIndex = truss.editPins.length;
        const pin = truss.startPins.length + editIndex;
        for (const h of this.onRemovePinHandlers) {
            h(editIndex, pin, ec);
        }
    }

    private doComposite(a: CompositeAction, ec: ElementContext): void {
        for (let i = 0; i < a.actions.length; i++) {
            this.doAction(a.actions[i], ec);
        }
    }

    private undoComposite(a: CompositeAction, ec: ElementContext): void {
        for (let i = a.actions.length - 1; i >= 0; i--) {
            this.undoAction(a.actions[i], ec);
        }
    }

    private doAction(a: TrussAction, ec: ElementContext): void {
        switch (a.type) {
            case "add_beam":
                this.doAddBeam(a, ec);
                break;
            case "add_pin":
                this.doAddPin(a, ec);
                break;
            case "composite":
                this.doComposite(a, ec);
                break;
        }
    }

    private undoAction(a: TrussAction, ec: ElementContext): void {
        switch (a.type) {
            case "add_beam":
                this.undoAddBeam(a, ec);
                break;
            case "add_pin":
                this.undoAddPin(a, ec);
                break;
            case "composite":
                this.undoComposite(a, ec);
                break;
        }
    }

    constructor(scene: SceneJSON) {
        this.scene = scene;
        this.onAddPinHandlers = [];
        this.onRemovePinHandlers = [];
        // TODO: proper initialization;
        this.editMaterial = 0;
        this.editWidth = 4;
        this.editDeck = false;
    }

    beamExists(p1: number, p2: number): boolean {
        const truss = this.scene.truss;
        for (const beam of truss.editBeams) {
            if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
                return true;
            }
        }
        for (const beam of truss.startBeams) {
            if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
                return true;
            }
        }
        return false;
    }

    // Scene enumeration/observation methods

    onAddPin(handler: OnAddPinHandler) {
        this.onAddPinHandlers.push(handler);
    }

    onRemovePin(handler: OnRemovePinHandler) {
        this.onRemovePinHandlers.push(handler);
    }

    // TODO: Clear handlers?

    getEditBeams(): Array<Beam> {
        return this.scene.truss.editBeams;
    }

    getStartBeams(): Array<Beam> {
        return this.scene.truss.startBeams;
    }

    getMaterial(m: number): Material {
        const materials = this.scene.truss.materials;
        if (m < 0 || m >= materials.length) {
            throw new Error(`invalid material ${m}`);
        }
        return materials[m];
    }

    *getUneditablePins() {
        const truss = this.scene.truss;
        let i = -truss.fixedPins.length;
        for (const p of truss.fixedPins) {
            yield {i, p};
            i++;
        }
        for (const p of truss.startPins) {
            yield {i, p};
            i++;
        }
    }

    *getEditPins() {
        const truss = this.scene.truss;
        let i = truss.startPins.length;
        for (const p of truss.editPins) {
            yield {i, p};
            i++;
        }
    }

    getPin(pin: number): Point2D {
        const truss = this.scene.truss;
        if (pin < -truss.fixedPins.length) {
            throw new Error(`Unkown pin index ${pin}`);
        } else if (pin < 0) {
            return truss.fixedPins[truss.fixedPins.length + pin];
        } else if (pin < truss.startPins.length) {
            return truss.startPins[pin];
        } else if (pin - truss.startPins.length < truss.editPins.length) {
            return truss.editPins[pin - truss.startPins.length];
        } else {
            throw new Error(`Unkown pin index ${pin}`);
        }
    }

    getClosestPin(p: Point2D, maxd: number, beamStart?: number): number | undefined {
        const truss = this.scene.truss;
        // TODO: acceleration structures. Probably only matters once we have 1000s of pins?
        const block = new Set<number>();
        let res = undefined;
        let resd = maxd;
        if (beamStart !== undefined) {
            for (const b of truss.startBeams) {
                if (b.p1 === beamStart) {
                    block.add(b.p2);
                } else if (b.p2 === beamStart) {
                    block.add(b.p1);
                }
            }
            for (const b of truss.editBeams) {
                if (b.p1 === beamStart) {
                    block.add(b.p2);
                } else if (b.p2 === beamStart) {
                    block.add(b.p1);
                }
            }
        }
        for (let i = 0; i < truss.fixedPins.length; i++) {
            const d = pointDistance(p, truss.fixedPins[i]);
            if (d < resd) {
                res = i - truss.fixedPins.length;
                resd = d;
            }
        }
        for (let i = 0; i < truss.startPins.length; i++) {
            const d = pointDistance(p, truss.startPins[i]);
            if (d < resd) {
                res = i;
                resd = d;
            }
        }
        for (let i = 0; i < truss.editPins.length; i++) {
            const d = pointDistance(p, truss.editPins[i]);
            if (d < resd) {
                res = i + truss.startPins.length;
                resd = d;
            }
        }
        return res;
    }

    undoCount(): number {
        return this.scene.undoStack.length;
    }

    redoCount(): number {
        return this.scene.redoStack.length;
    }

    // Scene mutation methods

    undo(ec: ElementContext): void {
        const a = this.scene.undoStack.pop();
        if (a === undefined) {
            throw new Error("no action to undo");
        }
        this.undoAction(a, ec);
        this.scene.redoStack.push(a);
    }

    redo(ec: ElementContext): void {
        const a = this.scene.redoStack.pop();
        if (a === undefined) {
            throw new Error("no action to redo");
        }
        this.doAction(a, ec);
        this.scene.undoStack.push(a);
    }

    private action(a: TrussAction, ec: ElementContext): void {
        this.scene.redoStack = [a];
        this.redo(ec);    // TODO: Is this too clever?
    }

    addBeam(
        p1: number,
        p2: number,
        ec: ElementContext,
    ): void {
        this.action({
            type: "add_beam",
            p1,
            p2,
            m: this.editMaterial,
            w: this.editWidth,
            l: undefined,
            deck: this.editDeck
        }, ec);
    }

    addPin(pin: Point2D, ec: ElementContext): void {
        this.action({type: "add_pin", pin}, ec);
    }

    addPinAndBeam(
        pin: Point2D,
        p2: number,
        ec: ElementContext,
    ): void {
        const p1 = this.scene.truss.editPins.length;
        this.action({type: "composite", actions: [
            { type: "add_pin", pin},
            {
                type: "add_beam",
                p1,
                p2,
                m: this.editMaterial,
                w: this.editWidth,
                l: undefined,
                deck: this.editDeck
            },
        ]}, ec);
    }
};

/*
export function sceneMethod(scene: Scene): ODEMethod {
    const truss = scene.truss;
    
    const fixedPins = truss.fixedPins;
    const mobilePins = truss.startPins.length + truss.editPins.length;
    // State accessors
    function getdx(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return fixedPins[fixedPins.length + pin][0];
        } else {
            return y[pin * 2 + 0];
        }
    }
    function getdy(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return fixedPins[fixedPins.length + pin][1];
        } else {
            return y[pin * 2 + 1];
        }
    }
    function getvx(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return 0.0;
        } else {
            return y[mobilePins * 2 + pin * 2 + 0];
        }
    }
    function getvy(y: Float32Array, pin: number): number {
        if (pin < 0) {
            return 0.0;
        } else {
            return y[mobilePins * 2 + pin * 2 + 1]; 
        }
    }
    function setdx(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[pin * 2 + 0] = val;
        }
    }
    function setdy(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[pin * 2 + 1] = val;
        }
    }
    function setvx(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 0] = val;
        }
    }
    function setvy(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 1] = val;
        }
    }
    function addvx(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
            y[mobilePins * 2 + pin * 2 + 0] += val;
        }
    }
    function addvy(y: Float32Array, pin: number, val: number) {
        if (pin >= 0) {
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
            return 5.972e24;    // Mass of the Earth.
        }
    }

    const beams = [...truss.startBeams, ...truss.editBeams].map((beam: Beam): SimulationBeam => {
        const p1 = beam.p1;
        const p2 = beam.p2;
        const l = pointDistance(scene.getPin(p1), scene.getPin(p2));
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
    const hmap: SimulationHMap = scene.terrain.hmap.map((h, i) => {
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
    function addDeck(i: number, d: SimulationBeam) {
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
            // TODO: now that getm returns mass of Earth for fixed pins, we don't need these different if clauses.
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
            } else {
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
                        continue;   // No Real solutions to intersection.
                    }
                    const rootD = Math.sqrt(D);
                    const t = -b / (2.0 * a);
                    let t1 = (-b - rootD) / (2.0 * a);
                    let t2 = (-b + rootD) / (2.0 * a);
                    if ((t1 <= 0.0 && t2 <= 0.0) || (t1 >= 1.0 && t2 >= 0.0)) {
                        continue;   // Intersections are both before or after deck.
                    }
                    t1 = Math.max(t1, 0.0);
                    t2 = Math.min(t2, 1.0);

                    // Compute collision acceleration.
                    // Acceleration is proportional to area 'shadowed' in the disc by the intersecting deck.
                    // This is so that as a disc moves between two deck segments, the acceleration remains constant.
                    const t1x = (1 - t1) * x1 + t1 * x2 - dx;   // Circle centre -> t1 intersection.
                    const t1y = (1 - t1) * y1 + t1 * y2 - dy;
                    const t2x = (1 - t2) * x1 + t2 * x2 - dx;   // Circle centre -> t2 intersection.
                    const t2y = (1 - t2) * y1 + t2 * y2 - dy;
                    const ta = Math.abs(Math.atan2(t1y, t1x) - Math.atan2(t2y, t2x)) % Math.PI;
                    const area = 0.5 * r * r * ta - 0.5 * Math.abs(t1x * t2y - t1y * t2x);
                    const an = 1000.0 * area;   // TODO: figure out what acceleration to use
                    let nx = cx - sx * t;
                    let ny = cy - sy * t;
                    const l = Math.sqrt(nx * nx + ny * ny);
                    nx /= l;
                    ny /= l;

                    // Apply accelerations to the disc.
                    const md = getm(disc.p);
                    const m1 = getm(deck.p1) * (1.0 - t);
                    const m2 = getm(deck.p2) * t;
                    const ad = (m1 + m2) / (md + m1 + m2);  // Share of acceleration for disc, deck endpoints.
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
                    const damp = 2;   // TODO: figure out how to derive a reasonable constant.
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

type CreateBeamPinState = {
    scene: Scene,
    i: number,
    drag?: { p: Point2D, i?: number },
};

function createBeamPinOnDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, state: CreateBeamPinState) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "black";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
    
    if (state.drag === undefined) {
        return;
    }
    const pin = state.scene.getPin(state.i);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pin[0], pin[1]);
    if (state.drag.i !== undefined) {
        const p = state.scene.getPin(state.drag.i);
        ctx.lineTo(p[0], p[1]);
    } else {
        ctx.lineTo(state.drag.p[0], state.drag.p[1]);
    }
    ctx.stroke();
}

function createBeamPinOnPan(ps: Array<PanPoint>, ec: ElementContext, state: CreateBeamPinState) {
    const i = state.scene.getClosestPin(ps[0].curr, 16, state.i);
    state.drag = {
        p: ps[0].curr,
        i,
    };
    ec.requestDraw();
}

function createBeamPinOnPanEnd(ec: ElementContext, state: CreateBeamPinState) {
    if (state.drag === undefined) {
        throw new Error("No drag state OnPanEnd");
    }
    if (state.drag.i === undefined) {
        state.scene.addPinAndBeam(state.drag.p, state.i, ec);
    } else if (!state.scene.beamExists(state.drag.i, state.i)) {
        // TODO: replace existing beam if one exists (and is editable).
        state.scene.addBeam(state.drag.i, state.i, ec);
    }
    state.drag = undefined;
}

function CreateBeamPin(scene: Scene, i: number, p: Point2D): PositionLayout<any, any> {
    // If we had state that was passed to all handlers, then we could avoid allocating new handlers per Element.
    return Position<CreateBeamPinState>(p[0] - 8, p[1] - 8, 16, 16, { scene, i })
        .onDraw(createBeamPinOnDraw)
        .onPan(createBeamPinOnPan)
        .onPanEnd(createBeamPinOnPanEnd);
}

function AddTrussEditablePins(scene: Scene): LayoutTakesWidthAndHeight {
    const children = [];
    for (const p of scene.getEditPins()) {
        children.push(CreateBeamPin(scene, p.i, p.p));
    }
    const e = Relative(...children);

    scene.onAddPin((editIndex: number, pin: number, p: Point2D, ec: ElementContext) => {
        console.log(`adding Element for pin ${pin} at child[${editIndex}], (${p[0]}, ${p[1]})`);
        addChild(e, CreateBeamPin(scene, pin, p), ec, editIndex);
        ec.requestLayout();
    });
    scene.onRemovePin((editIndex: number, pin: number, ec: ElementContext) => {
        console.log(`removing Element for pin ${pin} at child[${editIndex}]`);
        removeChild(e, editIndex, ec);
        ec.requestLayout();
    });

    // TODO: e.onDetach for removeing pin observers.
    return e;
}

function AddTrussUneditablePins(scene: Scene): LayoutTakesWidthAndHeight {
    const children = [];
    for (const p of scene.getUneditablePins()) {
        children.push(CreateBeamPin(scene, p.i, p.p));
    }
    return Relative(...children);
}

function AddTrussLayer(scene: Scene): LayoutTakesWidthAndHeight {
    return Layer(
        AddTrussUneditablePins(scene),
        AddTrussEditablePins(scene),
    );
}

function trussLayerOnDraw(ctx: CanvasRenderingContext2D, _box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, scene: Scene) {
    for (const b of scene.getStartBeams()) {
        ctx.lineWidth = b.w;
        ctx.lineCap = "round";
        ctx.strokeStyle = scene.getMaterial(b.m).style;
        ctx.beginPath();
        const p1 = scene.getPin(b.p1);
        const p2 = scene.getPin(b.p2);
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
    }
    for (const b of scene.getEditBeams()) {
        ctx.lineWidth = b.w;
        ctx.lineCap = "round";
        ctx.strokeStyle = scene.getMaterial(b.m).style;
        ctx.beginPath();
        const p1 = scene.getPin(b.p1);
        const p2 = scene.getPin(b.p2);
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
    }
}

function TrussLayer(scene: Scene): LayoutTakesWidthAndHeight {
    return Fill(scene).onDraw(trussLayerOnDraw);
}

// TODO: Take Scene as state instead of SceneJSON?
function drawTerrain(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, vp: LayoutBox, state: SceneJSON) {
    const terrain = state.terrain;
    const hmap = terrain.hmap;
    const pitch = state.width / (hmap.length - 1);
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
}

function drawFill(style: string | CanvasGradient | CanvasPattern) {
    return (ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = style;
        ctx.fillRect(box.left, box.top, box.width, box.height);
    }
}

function undoButtonTap(_p: Point2D, ec: ElementContext, scene: Scene) {
    if (scene.undoCount() > 0) {
        scene.undo(ec);
    }
}

function drawCircleWithArrow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ccw: boolean) {
    ctx.beginPath();
    const a = ccw ? Math.PI : 0;
    const l = ccw ? -Math.PI * 0.4 : Math.PI * 0.4;
    const px = r * Math.cos(a);
    const py = r * Math.sin(a)
    const tx = r * Math.cos(a - l) - px;
    const ty = r * Math.sin(a - l) - py;
    const nx = -ty / Math.sqrt(3);
    const ny = tx / Math.sqrt(3);
    const b = ccw ? Math.PI * 1.25 : Math.PI * 0.25;
    const e = ccw ? Math.PI * 2.75 : Math.PI * 1.75;
    ctx.ellipse(x, y, r, r, 0, b, e);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x + px + tx + nx, y + py + ty + ny);
    ctx.lineTo(x + px + tx - nx, y + py + ty - ny);
    ctx.fill();
}

function undoButtonDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, scene: Scene) {
    ctx.fillStyle = "white";
    ctx.fillRect(box.left, box.top, box.width, box.height);

    const iconStyle = scene.undoCount() === 0 ? "gray" : "black";
    ctx.strokeStyle = iconStyle;
    ctx.fillStyle = iconStyle;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    drawCircleWithArrow(
        ctx,
        box.left + box.width * 0.5,
        box.top + box.height * 0.5,
        22,
        true,
    );
}

function undoButton(scene: Scene) {
    return Flex(64, 0, scene).onTap(undoButtonTap).onDraw(undoButtonDraw);
}

function redoButtonTap(_p: Point2D, ec: ElementContext, scene: Scene) {
    if (scene.redoCount() > 0) {
        scene.redo(ec);
    }
}

function redoButtonDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, scene: Scene) {
    ctx.fillStyle = "white";
    ctx.fillRect(box.left, box.top, box.width, box.height);

    const iconStyle = scene.redoCount() === 0 ? "gray" : "black";
    ctx.strokeStyle = iconStyle;
    ctx.fillStyle = iconStyle;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    drawCircleWithArrow(
        ctx,
        box.left + box.width * 0.5,
        box.top + box.height * 0.5,
        22,
        false,
    );
}

function redoButton(scene: Scene) {
    return Flex(64, 0, scene).onTap(redoButtonTap).onDraw(redoButtonDraw);
}

export function SceneElement(sceneJSON: SceneJSON): LayoutTakesWidthAndHeight {
    const scene = new Scene(sceneJSON);

    const muxScene = Mux(
        ["terrain", "truss", "add_truss"],
        ["terrain", Fill(sceneJSON).onDraw(drawTerrain)],
        ["truss", TrussLayer(scene)],
        ["add_truss", AddTrussLayer(scene)],
    );

    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");

    const muxTools = Mux(
        ["undo"],
        [
            "undo",
            Left(
                undoButton(scene),
                redoButton(scene),
            ),
        ],
        ["g", Fill().onDraw(drawG)],
        ["b", Fill().onDraw(drawB)],
    );

    return Layer(
        Scroll(
            Box(
                sceneJSON.width, sceneJSON.height,
                muxScene,
            ),
            undefined,
            2,
        ),
        Bottom(
            Flex(64, 0,
                muxTools,  
            ),
            Flex(64, 0,
                Left(
                    Flex(64, 0).onDraw(drawR).onTap((_p: Point2D, ec: ElementContext) => { muxTools.set(ec, "undo"); }),
                    Flex(64, 0).onDraw(drawG).onTap((_p: Point2D, ec: ElementContext) => { muxTools.set(ec, "g"); }),
                    Flex(64, 0).onDraw(drawB).onTap((_p: Point2D, ec: ElementContext) => { muxTools.set(ec, "b"); }),
                ),
            ),
        ),
    );
}
