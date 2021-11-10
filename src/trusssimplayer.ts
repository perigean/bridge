// Copyright 2021 Charles Dueck

import { TrussSim, TrussSimState } from "./trusssim.js";
import { ElementContext, TimerHandler } from "./ui/node.js";

export class TrussSimPlayer {
    sim: TrussSim;
    private h: number;                              // Time step.
    private tLatest: number;                        // The highest time value simulated.
    private keyInterval: number;                    // Time per keyframe.
    private keyframes: Map<number, TrussSimState>;   // Map of time to saved state.
    private playTimer: number | undefined;
    private playSpeed: number;
    private playTime: number;
    private playTick: TimerHandler;

    constructor(sim: TrussSim, h: number, keyInterval: number) {
        this.sim = sim;
        this.h = h;
        this.tLatest = 0;
        this.keyInterval = keyInterval;
        this.keyframes = new Map();
        this.playTimer = undefined;
        this.playSpeed = 0;
        this.playTime = 0;
        this.playTick = (ms: number, ec: ElementContext) => {
            // Only compute up to 100ms of frames per tick, to allow other things to happen if we are behind.
            let t1 = Math.min(this.playTime + ms * 0.001 * this.playSpeed, this.sim.t + 0.1);
            while (this.sim.t < t1) {
                this.next();
            }
            ec.requestDraw();
        };
        // Store the initial keyframe as whatever state we were passed, so we can always seek back to it.
        this.keyframes.set(this.sim.t, this.sim.save());
    }

    private next() {
        const prevT = this.sim.t;
        this.sim.next(this.h);
        const isKeyframe = Math.floor(prevT / this.keyInterval) !== Math.floor(this.sim.t / this.keyInterval);
        if (this.tLatest < this.sim.t) {
            if (isKeyframe) {
                this.keyframes.set(this.sim.t, this.sim.save());
            }
            this.tLatest = this.sim.t;
        } else if (isKeyframe) {
            const s = this.keyframes.get(this.sim.t);
            if (s === undefined) {
                console.log(`frame ${this.sim.t} should be a keyframe`);
                return;
            }
            if (!this.sim.stateEquals(s)) {
                throw new Error(`non-deterministic playback at t ${this.sim.t}`);
            }
        }
    }

    speed(): number {
        return this.playSpeed;
    }

    play(ec: ElementContext, speed: number) {
        if (this.playSpeed === speed) {
            return;
        }
        if (this.playTimer !== undefined) {
            this.pause(ec);
        }
        this.playTime = this.sim.t;
        this.playSpeed = speed;
        this.playTimer = ec.timer(this.playTick, undefined);
    }

    pause(ec: ElementContext) {
        if (this.playTimer === undefined) {
            return;
        }
        ec.clearTimer(this.playTimer);
        this.playTimer = undefined;
        this.playSpeed = 0;
    }

    seekTimes(): IterableIterator<number> {
        return this.keyframes.keys();
    }

    seek(t: number, ec: ElementContext) {
        const y = this.keyframes.get(t);
        if (y === undefined) {
            throw new Error(`${t} is not a keyframe time`);
        }
        this.sim.restore(t, y);
        if (this.playTimer !== undefined) {
            const speed = this.playSpeed;
            this.pause(ec);
            this.play(ec, speed);
        }
    }
};