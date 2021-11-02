// Copyright 2021 Charles Dueck

import { Point2D } from "./point.js";

// TODO: validation code?

export type BeamJSON = {
    p1: number; // Index of pin at beginning of beam.
    p2: number; // Index of pin at end of beam.
    m: number;  // Index of material of beam.
    w: number;  // Width of beam.
    l?: number; // Length of beam, only specified when pre-straining.
    deck?: boolean; // Is this beam a deck? (do discs collide?)
};

export type DiscJSON = {
    p: number;  // Index of moveable pin this disc surrounds.
    m: number;  // Material of disc.
    r: number;  // Radius of disc.
    v: number;  // Velocity of surface of disc (in CCW direction).
};

export type MaterialJSON = {
    E: number;  // Young's modulus in Pa.
    density: number;    // kg/m^3
    style: string | CanvasGradient | CanvasPattern;
    friction: number;
    maxLength: number;
    tensionYield: number;
    buckleYield: number;
    // TODO: work hardening, etc.
};

// Pin indexing
//
//  Pins are indexed such that pins that can't move during the simulation have
//  negative indices, and pins that can move have non-negative indices. This
//  makes setting up the state vector for ODEMethod simpler.
//  [
//      -fixedPins.length: fixedPins[0]
//      ...
//      -1: fixedPins[fixedPins.length-1]
//      0: trainPins[0]
//      ...
//      trainPins.length - 1: trainPins[trainPins.length - 1]
//      trainPins.length: editPins[0]
//      ...
//      trainPins.length + editPins.length - 1: editPins[editPins.length - 1]
//  ]

export type TrussJSON = {
    fixedPins: Array<Point2D>;
    trainPins: Array<Point2D>;
    editPins: Array<Point2D>;
    trainBeams: Array<BeamJSON>;
    editBeams: Array<BeamJSON>;
    discs: Array<DiscJSON>;
    materials: Array<MaterialJSON>;
};

export function getPin(truss: TrussJSON, pin: number): Point2D {
    if (pin < -truss.fixedPins.length) {
        throw new Error(`Unkown pin index ${pin}`);
    } else if (pin < 0) {
        return truss.fixedPins[truss.fixedPins.length + pin];
    } else if (pin < truss.trainPins.length) {
        return truss.trainPins[pin];
    } else if (pin - truss.trainPins.length < truss.editPins.length) {
        return truss.editPins[pin - truss.trainPins.length];
    } else {
        throw new Error(`Unkown pin index ${pin}`);
    }
}

export type TerrainJSON = {
    hmap: Array<number>;
    friction: number;
    style: string | CanvasGradient | CanvasPattern;
};

export type AddBeamActionJSON = {
    type: "add_beam";
    p1: number;
    p2: number;
    m: number;
    w: number;
    l?: number;
    deck?: boolean;
};

export type AddPinActionJSON = {
    type: "add_pin";
    pin: Point2D;
};

export type CompositeActionJSON = {
    type: "composite";
    actions: Array<SceneActionJSON>;
};

export type SceneActionJSON = AddBeamActionJSON | AddPinActionJSON | CompositeActionJSON;

export type SceneJSON = {
    truss: TrussJSON;
    terrain: TerrainJSON;
    height: number;
    width: number;
    g: Point2D;  // Acceleration due to gravity.
    redoStack: Array<SceneActionJSON>;
    undoStack: Array<SceneActionJSON>;
};
