import { describe, expect, it } from "vitest";
import {
  DEFAULT_LINK_RATE_MBPS,
  EARTH_MOON_DISTANCE_METERS,
  SPEED_OF_LIGHT_METERS_PER_SECOND,
  createReferenceSettings
} from "./constants";
import { conversation } from "./conversation";
import { getStationDistanceMeters } from "../realtime/stations";
import {
  PRESENCE_SEQUENCE,
  PRESENCE_STAGGER_SECONDS
} from "./presence";
import {
  SignalEngine,
  buildTransmissionEvents,
  calculatePropagationTime,
  calculateTransmissionTime,
  getNextEventTime,
  getTransmissionState
} from "./SignalEngine";

describe("SignalEngine scientific calculations", () => {
  it("calculates Earth-Moon propagation time from the reference constants", () => {
    expect(
      calculatePropagationTime(
        EARTH_MOON_DISTANCE_METERS,
        SPEED_OF_LIGHT_METERS_PER_SECOND
      )
    ).toBeCloseTo(1.28222, 6);
  });

  it("calculates payload transmission time from payload size and bandwidth", () => {
    expect(calculateTransmissionTime(48_000_000, DEFAULT_LINK_RATE_MBPS)).toBeCloseTo(
      0.145015,
      6
    );
  });

  it("launches text, voice, expression and point cloud in progressive order", () => {
    const events = buildTransmissionEvents(
      [conversation[0]],
      createReferenceSettings()
    );

    expect(events.map((event) => event.presenceForm)).toEqual(PRESENCE_SEQUENCE);
    expect(events[0].sentAt).toBe(0);
    expect(events[1].sentAt).toBe(PRESENCE_STAGGER_SECONDS);
    expect(events[2].sentAt).toBe(PRESENCE_STAGGER_SECONDS * 2);
    expect(events[3].sentAt).toBe(PRESENCE_STAGGER_SECONDS * 3);
  });

  it("starts another message while the previous point cloud is still in transit", () => {
    const events = buildTransmissionEvents(
      conversation.slice(0, 2),
      createReferenceSettings()
    );
    const fatherTurn = events.filter((event) => event.messageId === "father-00");
    const daughterTurn = events.filter(
      (event) => event.messageId === "daughter-01"
    );
    const fatherReadyAt = Math.max(
      ...fatherTurn.map((event) => event.renderReadyAt)
    );

    expect(daughterTurn[0].sender).toBe("daughter");
    expect(daughterTurn[0].captureTime).toBe(1);
    expect(daughterTurn[0].captureTime).toBeLessThan(fatherReadyAt);
    expect(daughterTurn.map((event) => event.presenceForm)).toEqual(PRESENCE_SEQUENCE);
  });

  it("does not wait between messages from the same sender", () => {
    const events = buildTransmissionEvents([
      { ...conversation[0], sentAt: 0 },
      { ...conversation[2], sentAt: 0.5 }
    ], createReferenceSettings());
    const firstPointCloud = events.find((event) =>
      event.messageId === "father-00" && event.presenceForm === "pointCloud");
    const secondText = events.find((event) =>
      event.messageId === "father-02" && event.presenceForm === "text");
    expect(secondText?.captureTime).toBe(0.5);
    expect(secondText!.captureTime).toBeLessThan(firstPointCloud!.renderReadyAt);
  });

  it("delivers text before audio, motion and point cloud", () => {
    const events = buildTransmissionEvents(
      [conversation[0]],
      createReferenceSettings()
    );
    const text = events.find((event) => event.presenceForm === "text");
    const voice = events.find((event) => event.presenceForm === "voice");
    const expression = events.find((event) => event.presenceForm === "expression");
    const pointCloud = events.find((event) => event.presenceForm === "pointCloud");

    expect(text?.renderReadyAt).toBeCloseTo(1.282, 3);
    expect(voice?.renderReadyAt).toBeCloseTo(2.033, 3);
    expect(expression?.renderReadyAt).toBeCloseTo(2.927, 3);
    expect(pointCloud?.networkArrivalTime).toBeCloseTo(6.553, 3);
    expect(pointCloud?.renderReadyAt).toBeCloseTo(7.753, 3);
    expect(text?.payloadBits).toBeLessThan(2_240);
  });

  it("uses a much shorter Earth-Space Station delay than Earth-Moon", () => {
    const moonSettings = createReferenceSettings();
    moonSettings.earthMoonDistanceMeters = getStationDistanceMeters(
      "earth",
      "moon"
    );
    const stationSettings = createReferenceSettings();
    stationSettings.earthMoonDistanceMeters = getStationDistanceMeters(
      "earth",
      "spaceStation"
    );

    const moonEvents = buildTransmissionEvents([conversation[0]], moonSettings);
    const stationEvents = buildTransmissionEvents(
      [conversation[0]],
      stationSettings
    );
    const moonText = moonEvents.find((event) => event.presenceForm === "text");
    const stationText = stationEvents.find(
      (event) => event.presenceForm === "text"
    );

    expect(stationText?.propagationTime).toBeCloseTo(0.001361, 6);
    expect(moonText?.propagationTime).toBeCloseTo(1.28222, 5);
    expect(stationText?.renderReadyAt).toBeLessThan(
      moonText?.renderReadyAt ?? 0
    );
  });

  it("keeps the point cloud in reconstruction before it becomes visible", () => {
    const pointCloud = buildTransmissionEvents(
      [conversation[0]],
      createReferenceSettings()
    ).find((event) => event.presenceForm === "pointCloud");

    expect(pointCloud).toBeDefined();
    if (!pointCloud) {
      return;
    }

    expect(getTransmissionState(pointCloud, pointCloud.networkArrivalTime + 0.5)).toBe(
      "decoding"
    );
    expect(getTransmissionState(pointCloud, pointCloud.renderReadyAt + 0.1)).toBe(
      "arrived"
    );
  });

  it("allows a message to transmit only one selected presence form", () => {
    const events = buildTransmissionEvents(
      [
        {
          id: "voice-only",
          sentAt: 3.5,
          sender: "father",
          text: "Can you hear me?",
          action: "speaks",
          presenceForms: ["voice"]
        }
      ],
      createReferenceSettings()
    );

    expect(events).toHaveLength(1);
    expect(events[0].presenceForm).toBe("voice");
    expect(events[0].recipient).toBe("daughter");
  });

  it("steps through staged launches as well as arrivals", () => {
    const events = buildTransmissionEvents(
      [conversation[0]],
      createReferenceSettings()
    );

    expect(getNextEventTime(events, 0)).toBe(
      PRESENCE_STAGGER_SECONDS
    );
  });

  it("does not duplicate events after reset", () => {
    const engine = new SignalEngine();
    const firstRun = engine.getEvents();

    engine.reset();
    const secondRun = engine.getEvents();
    const uniqueIds = new Set(secondRun.map((event) => event.id));

    expect(secondRun).toHaveLength(firstRun.length);
    expect(uniqueIds.size).toBe(secondRun.length);
  });

  it("recalculates point-cloud delivery when bandwidth changes", () => {
    const engine = new SignalEngine(createReferenceSettings());
    const firstPointCloud = engine
      .getEvents()
      .find(
        (event) =>
          event.messageId === "father-00" &&
          event.presenceForm === "pointCloud"
      );

    const slowerSettings = createReferenceSettings();
    slowerSettings.linkRateMbps = 100;
    engine.updateSettings(slowerSettings);
    const slowerPointCloud = engine
      .getEvents()
      .find(
        (event) =>
          event.messageId === "father-00" &&
          event.presenceForm === "pointCloud"
      );

    expect(slowerPointCloud?.networkArrivalTime).toBeGreaterThan(
      firstPointCloud?.networkArrivalTime ?? 0
    );
  });
});
