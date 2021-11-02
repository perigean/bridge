// Copyright 2021 Charles Dueck
export class TrussSimPlayer {
    constructor(sim, h, keyInterval) {
        this.sim = sim;
        this.h = h;
        this.tLatest = 0;
        this.keyInterval = keyInterval;
        this.keyframes = new Map();
        this.playTimer = undefined;
        this.playTime = 0;
        this.playTick = (ms, ec) => {
            // Only compute up to 100ms of frames per tick, to allow other things to happen if we are behind.
            let t1 = Math.min(this.playTime + ms * 0.001, this.sim.t + 0.1);
            while (this.sim.t < t1) {
                this.next();
            }
            ec.requestDraw();
        };
        // Store the initial keyframe as whatever state we were passed, so we can always seek back to it.
        this.keyframes.set(this.sim.t, this.sim.save());
    }
    next() {
        const prevT = this.sim.t;
        this.sim.next(this.h);
        const isKeyframe = Math.floor(prevT / this.keyInterval) !== Math.floor(this.sim.t / this.keyInterval);
        if (this.tLatest < this.sim.t) {
            if (isKeyframe) {
                this.keyframes.set(this.sim.t, this.sim.save());
            }
            this.tLatest = this.sim.t;
        }
        else if (isKeyframe) {
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
    playing() {
        return this.playTimer !== undefined;
    }
    play(ec) {
        if (this.playTimer !== undefined) {
            return;
        }
        this.playTime = this.sim.t;
        this.playTimer = ec.timer(this.playTick, undefined);
    }
    pause(ec) {
        if (this.playTimer === undefined) {
            return;
        }
        ec.clearTimer(this.playTimer);
        this.playTimer = undefined;
    }
    seekTimes() {
        return this.keyframes.keys();
    }
    seek(t, ec) {
        const y = this.keyframes.get(t);
        if (y === undefined) {
            throw new Error(`${t} is not a keyframe time`);
        }
        this.sim.restore(t, y);
        if (this.playTimer !== undefined) {
            this.pause(ec);
            this.play(ec);
        }
    }
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3NzaW1wbGF5ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHJ1c3NzaW1wbGF5ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBSy9CLE1BQU0sT0FBTyxjQUFjO0lBVXZCLFlBQVksR0FBYSxFQUFFLENBQVMsRUFBRSxXQUFtQjtRQUNyRCxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDakIsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFVLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQy9DLGlHQUFpRztZQUNqRyxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsRUFBRSxHQUFHLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztZQUNoRSxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtnQkFDcEIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2FBQ2Y7WUFDRCxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDckIsQ0FBQyxDQUFDO1FBQ0YsaUdBQWlHO1FBQ2pHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNw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QUUsQ0FBQyxDQUFDO1NBQ2pCO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDIxIENoYXJsZXMgRHVlY2tcblxuaW1wb3J0IHsgVHJ1c3NTaW0sIFRydXNzU2ltU3RhdGUgfSBmcm9tIFwiLi90cnVzc3NpbS5qc1wiO1xuaW1wb3J0IHsgRWxlbWVudENvbnRleHQsIFRpbWVySGFuZGxlciB9IGZyb20gXCIuL3VpL25vZGUuanNcIjtcblxuZXhwb3J0IGNsYXNzIFRydXNzU2ltUGxheWVyIHtcbiAgICBzaW06IFRydXNzU2ltO1xuICAgIHByaXZhdGUgaDogbnVtYmVyOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRpbWUgc3RlcC5cbiAgICBwcml2YXRlIHRMYXRlc3Q6IG51bWJlcjsgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgaGlnaGVzdCB0aW1lIHZhbHVlIHNpbXVsYXRlZC5cbiAgICBwcml2YXRlIGtleUludGVydmFsOiBudW1iZXI7ICAgICAgICAgICAgICAgICAgICAvLyBUaW1lIHBlciBrZXlmcmFtZS5cbiAgICBwcml2YXRlIGtleWZyYW1lczogTWFwPG51bWJlciwgVHJ1c3NTaW1TdGF0ZT47ICAgLy8gTWFwIG9mIHRpbWUgdG8gc2F2ZWQgc3RhdGUuXG4gICAgcHJpdmF0ZSBwbGF5VGltZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIHBsYXlUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBwbGF5VGljazogVGltZXJIYW5kbGVyO1xuXG4gICAgY29uc3RydWN0b3Ioc2ltOiBUcnVzc1NpbSwgaDogbnVtYmVyLCBrZXlJbnRlcnZhbDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2ltID0gc2ltO1xuICAgICAgICB0aGlzLmggPSBoO1xuICAgICAgICB0aGlzLnRMYXRlc3QgPSAwO1xuICAgICAgICB0aGlzLmtleUludGVydmFsID0ga2V5SW50ZXJ2YWw7XG4gICAgICAgIHRoaXMua2V5ZnJhbWVzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnBsYXlUaW1lciA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5wbGF5VGltZSA9IDA7XG4gICAgICAgIHRoaXMucGxheVRpY2sgPSAobXM6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICAvLyBPbmx5IGNvbXB1dGUgdXAgdG8gMTAwbXMgb2YgZnJhbWVzIHBlciB0aWNrLCB0byBhbGxvdyBvdGhlciB0aGluZ3MgdG8gaGFwcGVuIGlmIHdlIGFyZSBiZWhpbmQuXG4gICAgICAgICAgICBsZXQgdDEgPSBNYXRoLm1pbih0aGlzLnBsYXlUaW1lICsgbXMgKiAwLjAwMSwgdGhpcy5zaW0udCArIDAuMSk7XG4gICAgICAgICAgICB3aGlsZSAodGhpcy5zaW0udCA8IHQxKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9O1xuICAgICAgICAvLyBTdG9yZSB0aGUgaW5pdGlhbCBrZXlmcmFtZSBhcyB3aGF0ZXZlciBzdGF0ZSB3ZSB3ZXJlIHBhc3NlZCwgc28gd2UgY2FuIGFsd2F5cyBzZWVrIGJhY2sgdG8gaXQuXG4gICAgICAgIHRoaXMua2V5ZnJhbWVzLnNldCh0aGlzLnNpbS50LCB0aGlzLnNpbS5zYXZlKCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbmV4dCgpIHtcbiAgICAgICAgY29uc3QgcHJldlQgPSB0aGlzLnNpbS50O1xuICAgICAgICB0aGlzLnNpbS5uZXh0KHRoaXMuaCk7XG4gICAgICAgIGNvbnN0IGlzS2V5ZnJhbWUgPSBNYXRoLmZsb29yKHByZXZUIC8gdGhpcy5rZXlJbnRlcnZhbCkgIT09IE1hdGguZmxvb3IodGhpcy5zaW0udCAvIHRoaXMua2V5SW50ZXJ2YWwpO1xuICAgICAgICBpZiAodGhpcy50TGF0ZXN0IDwgdGhpcy5zaW0udCkge1xuICAgICAgICAgICAgaWYgKGlzS2V5ZnJhbWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmtleWZyYW1lcy5zZXQodGhpcy5zaW0udCwgdGhpcy5zaW0uc2F2ZSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudExhdGVzdCA9IHRoaXMuc2ltLnQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNLZXlmcmFtZSkge1xuICAgICAgICAgICAgY29uc3QgcyA9IHRoaXMua2V5ZnJhbWVzLmdldCh0aGlzLnNpbS50KTtcbiAgICAgICAgICAgIGlmIChzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZnJhbWUgJHt0aGlzLnNpbS50fSBzaG91bGQgYmUgYSBrZXlmcmFtZWApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGhpcy5zaW0uc3RhdGVFcXVhbHMocykpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYG5vbi1kZXRlcm1pbmlzdGljIHBsYXliYWNrIGF0IHQgJHt0aGlzLnNpbS50fWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcGxheWluZygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGxheVRpbWVyICE9PSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcGxheShlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgaWYgKHRoaXMucGxheVRpbWVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBsYXlUaW1lID0gdGhpcy5zaW0udDtcbiAgICAgICAgdGhpcy5wbGF5VGltZXIgPSBlYy50aW1lcih0aGlzLnBsYXlUaWNrLCB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIHBhdXNlKGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBpZiAodGhpcy5wbGF5VGltZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGVjLmNsZWFyVGltZXIodGhpcy5wbGF5VGltZXIpO1xuICAgICAgICB0aGlzLnBsYXlUaW1lciA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBzZWVrVGltZXMoKTogSXRlcmFibGVJdGVyYXRvcjxudW1iZXI+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5ZnJhbWVzLmtleXMoKTtcbiAgICB9XG5cbiAgICBzZWVrKHQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHkgPSB0aGlzLmtleWZyYW1lcy5nZXQodCk7XG4gICAgICAgIGlmICh5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgJHt0fSBpcyBub3QgYSBrZXlmcmFtZSB0aW1lYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zaW0ucmVzdG9yZSh0LCB5KTtcbiAgICAgICAgaWYgKHRoaXMucGxheVRpbWVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5wbGF5KGVjKTtcbiAgICAgICAgfVxuICAgIH1cbn07Il19