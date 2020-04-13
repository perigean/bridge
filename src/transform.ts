// transform.js
//
// Copyright Charles Dick 2020

import {Point2D} from "point.js"

// TODO: unit tests, it will suck if there is a typo in here, so find it first!
// TODO: apply Readonly<> to everything that can.

export type Affine2D = [number, number, number, number, number, number];

function transformIdentityCreate(): Affine2D {
  return [
    1.0, 0.0, 0.0,
    0.0, 1.0, 0.0,
  ];
}

function transformTranslateCreate(x: number, y: number): Affine2D {
  return [
    1.0, 0.0, x,
    0.0, 1.0, y,
  ];
}

function transformScaleCreate(s: number): Affine2D {
  return [
    s, 0.0, 0.0,
    0.0, s, 0.0,
  ];
}

function transformStretchCreate(sx: number, sy: number): Affine2D {
  return [
    sx, 0.0, 0.0,
    0.0, sy, 0.0,
  ];
}

function transformRotateCreate(angle: number): Affine2D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c, -s, 0.0,
    s,  c, 0.0,
  ];
}

// combine two transforms, so t1 is applied, then t2
function transformCompose(t1: Affine2D, t2: Affine2D): Affine2D {
  return [
    t2[0] * t1[0] + t2[1] * t1[3], t2[0] * t1[1] + t2[1] * t1[4], t2[0] * t1[2] + t2[1] * t1[5] + t2[2],
    t2[3] * t1[0] + t2[4] * t1[3], t2[3] * t1[1] + t2[4] * t1[4], t2[3] * t1[2] + t2[4] * t1[5] + t2[5],
  ];
}

function transformTranslate(t: Affine2D, x: number, y: number): Affine2D {
  return [
    t[0], t[1], t[2] + x,
    t[3], t[4], t[5] + y,
  ];
}

function transformScale(t: Affine2D, s: number): Affine2D {
  return [
    s * t[0], s * t[1], s * t[2],
    s * t[3], s * t[4], s * t[5],
  ];
}

function transformRotate(t: Affine2D, angle: number): Affine2D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c * t[0] - s * t[3], c * t[1] - s * t[4], c * t[2] - s * t[5],
    s * t[0] + c * t[3], s * t[1] + c * t[4], s * t[2] + c * t[5],
  ];
}

function transformStretch(t: Affine2D, sx: number, sy: number): Affine2D {
  return [
    sx * t[0], sx * t[1], sx * t[2],
    sy * t[3], sy * t[4], sy * t[5],
  ];
}

function transformInvert(t: Affine2D): Affine2D {
  const det = t[0] * t[4] - t[3] * t[1];
  const dx = t[1] * t[5] - t[4] * t[2];
  const dy = t[3] * t[2] - t[0] * t[5];
  return [
     t[4] / det, -t[1] / det, dx / det,
    -t[3] / det,  t[0] / det, dy / det,
  ];
}

function transformPoint(t: Readonly<Affine2D>, p: Point2D): Point2D {
  return [
    p[0] * t[0] + p[1] * t[1] + t[2],
    p[0] * t[3] + p[1] * t[4] + t[5],
  ];
}

function transformMutatePoint(t: Affine2D, p: Point2D) {
  const x = p[0] * t[0] + p[1] * t[1] + t[2];
  const y = p[0] * t[3] + p[1] * t[4] + t[5];
  p[0] = x;
  p[1] = y;
}

function transformNormal(t: Affine2D, n: Point2D): Point2D {
  return [
    n[0] * t[0] + n[1] * t[1],
    n[0] * t[3] + n[1] * t[4],
  ];
}

function transformMutateNormal(t: Affine2D, n: Point2D) {
  const x = n[0] * t[0] + n[1] * t[1];
  const y = n[0] * t[3] + n[1] * t[4];
  n[0] = x;
  n[1] = y;
}

export {
  transformCompose,
  transformIdentityCreate,
  transformInvert,
  transformMutateNormal,
  transformMutatePoint,
  transformNormal,
  transformPoint,
  transformScale,
  transformScaleCreate,
  transformStretch,
  transformStretchCreate,
  transformTranslate,
  transformTranslateCreate,
  transformRotate,
  transformRotateCreate,
};
