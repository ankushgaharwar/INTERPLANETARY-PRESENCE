import { clamp } from "./format";

export class SimulationClock {
  private currentTimeSeconds = 0;
  private running = false;
  private playbackSpeed = 1;
  private lastRealTimeMs = 0;

  constructor(private readonly durationSeconds: number) {}

  start(realTimeMs = 0) {
    this.currentTimeSeconds = 0;
    this.running = true;
    this.lastRealTimeMs = realTimeMs;
    return this.currentTimeSeconds;
  }

  pause(realTimeMs = this.lastRealTimeMs) {
    this.tick(realTimeMs);
    this.running = false;
    return this.currentTimeSeconds;
  }

  resume(realTimeMs = this.lastRealTimeMs) {
    if (!this.running) {
      this.running = true;
      this.lastRealTimeMs = realTimeMs;
    }

    return this.currentTimeSeconds;
  }

  tick(realTimeMs: number) {
    if (!this.running) {
      return this.currentTimeSeconds;
    }

    const deltaMs = Math.max(0, realTimeMs - this.lastRealTimeMs);
    this.currentTimeSeconds = clamp(
      this.currentTimeSeconds + (deltaMs / 1000) * this.playbackSpeed,
      0,
      this.durationSeconds
    );
    this.lastRealTimeMs = realTimeMs;

    if (this.currentTimeSeconds >= this.durationSeconds) {
      this.running = false;
    }

    return this.currentTimeSeconds;
  }

  stepTo(targetTimeSeconds: number, realTimeMs = this.lastRealTimeMs) {
    this.currentTimeSeconds = clamp(targetTimeSeconds, 0, this.durationSeconds);
    this.lastRealTimeMs = realTimeMs;
    return this.currentTimeSeconds;
  }

  reset(realTimeMs = 0) {
    this.currentTimeSeconds = 0;
    this.running = false;
    this.playbackSpeed = 1;
    this.lastRealTimeMs = realTimeMs;
    return this.currentTimeSeconds;
  }

  setSpeed(speed: number, realTimeMs = this.lastRealTimeMs) {
    if (speed <= 0) {
      throw new Error("Playback speed must be greater than zero.");
    }

    this.tick(realTimeMs);
    this.playbackSpeed = speed;
    this.lastRealTimeMs = realTimeMs;
    return this.currentTimeSeconds;
  }

  get time() {
    return this.currentTimeSeconds;
  }

  get speed() {
    return this.playbackSpeed;
  }

  get isRunning() {
    return this.running;
  }
}
