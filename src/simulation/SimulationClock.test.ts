import { describe, expect, it } from "vitest";
import { SimulationClock } from "./SimulationClock";

describe("SimulationClock", () => {
  it("pauses and resumes deterministically", () => {
    const clock = new SimulationClock(20);

    clock.start(0);
    expect(clock.tick(1000)).toBeCloseTo(1);
    expect(clock.pause(2000)).toBeCloseTo(2);
    expect(clock.tick(5000)).toBeCloseTo(2);

    clock.resume(5000);
    expect(clock.tick(6000)).toBeCloseTo(3);
  });

  it("applies playback-speed changes from the moment of change", () => {
    const clock = new SimulationClock(20);

    clock.start(0);
    clock.setSpeed(2, 1000);
    expect(clock.time).toBeCloseTo(1);
    expect(clock.tick(2000)).toBeCloseTo(3);

    clock.setSpeed(0.5, 2000);
    expect(clock.tick(4000)).toBeCloseTo(4);
  });

  it("resets time, running state and speed", () => {
    const clock = new SimulationClock(20);

    clock.start(0);
    clock.setSpeed(4, 250);
    clock.tick(1000);
    clock.reset();

    expect(clock.time).toBe(0);
    expect(clock.speed).toBe(1);
    expect(clock.isRunning).toBe(false);
  });
});
