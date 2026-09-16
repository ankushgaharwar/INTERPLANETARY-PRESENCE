import type { PresenceFormId, ScientificSettings } from "./types";

export const EARTH_MOON_DISTANCE_METERS = 384_400_000;
export const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458;
export const DEFAULT_LINK_RATE_MBPS = 331;
export const DEFAULT_POINT_CLOUD_RECONSTRUCTION_SECONDS = 1.2;

export const DEFAULT_PAYLOAD_BITS: Record<PresenceFormId, number> = {
  voice: 320_000,
  expression: 48_000_000,
  pointCloud: 1_000_000_000
};

export const createReferenceSettings = (): ScientificSettings => ({
  earthMoonDistanceMeters: EARTH_MOON_DISTANCE_METERS,
  speedOfLightMetersPerSecond: SPEED_OF_LIGHT_METERS_PER_SECOND,
  linkRateMbps: DEFAULT_LINK_RATE_MBPS,
  pointCloudReconstructionSeconds: DEFAULT_POINT_CLOUD_RECONSTRUCTION_SECONDS,
  payloadBits: { ...DEFAULT_PAYLOAD_BITS }
});
