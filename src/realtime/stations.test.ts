import { describe, expect, it } from "vitest";
import { getStationDistanceMeters, STATION_BY_ID } from "./stations";

describe("station links", () => {
  it("offers Earth, Moon and Space Station", () => {
    expect(Object.keys(STATION_BY_ID)).toEqual([
      "earth",
      "moon",
      "spaceStation"
    ]);
  });

  it("uses low Earth orbit distance for Earth to Space Station", () => {
    expect(getStationDistanceMeters("earth", "spaceStation")).toBe(408_000);
  });

  it("keeps lunar links near the Earth-Moon baseline", () => {
    expect(getStationDistanceMeters("earth", "moon")).toBe(384_400_000);
    expect(getStationDistanceMeters("moon", "spaceStation")).toBe(384_000_000);
  });
});
