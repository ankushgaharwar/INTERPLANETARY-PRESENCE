import { Globe2, Moon, Orbit } from "lucide-react";
import type { StationId } from "./types";

export const STATIONS = [
  {
    id: "earth",
    label: "Earth",
    detail: "Home environment",
    icon: Globe2
  },
  {
    id: "moon",
    label: "Moon",
    detail: "Lunar habitat",
    icon: Moon
  },
  {
    id: "spaceStation",
    label: "Space Station",
    detail: "Orbital module",
    icon: Orbit
  }
] as const;

export const STATION_BY_ID = STATIONS.reduce(
  (stations, station) => ({ ...stations, [station.id]: station }),
  {} as Record<StationId, (typeof STATIONS)[number]>
);

export const getStationDistanceMeters = (
  first: StationId,
  second: StationId
) => {
  if (first === second) {
    return 1_000;
  }

  const pair = new Set([first, second]);
  if (pair.has("earth") && pair.has("spaceStation")) {
    return 408_000;
  }

  if (pair.has("moon") && pair.has("spaceStation")) {
    return 384_000_000;
  }

  return 384_400_000;
};
