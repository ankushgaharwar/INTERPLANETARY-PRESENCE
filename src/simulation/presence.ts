import { DEFAULT_PAYLOAD_BITS } from "./constants";
import type { PresenceFormDefinition, PresenceFormId } from "./types";

export const PRESENCE_SEQUENCE: PresenceFormId[] = [
  "voice",
  "expression",
  "pointCloud"
];

export const PRESENCE_STAGGER_SECONDS = 0.75;
export const TURN_RESPONSE_GAP_SECONDS = 0.85;

export const PRESENCE_FORMS: PresenceFormDefinition[] = [
  {
    id: "voice",
    label: "Voice",
    shortLabel: "Voice",
    principle: "Hear tone, timing and direction",
    assumption: "10 seconds of spatial Opus audio",
    color: "#8fdcff",
    defaultPayloadBits: DEFAULT_PAYLOAD_BITS.voice
  },
  {
    id: "expression",
    label: "Live video · expression, motion & intent",
    shortLabel: "Live video",
    principle: "See gaze, affect, gesture and intent",
    assumption: "Encrypted camera video with embodied visual cues",
    color: "#ffd36a",
    defaultPayloadBits: DEFAULT_PAYLOAD_BITS.expression
  },
  {
    id: "pointCloud",
    label: "Simulated point cloud",
    shortLabel: "Point cloud",
    principle: "Rebuild body scale, furniture and surrounding space",
    assumption: "10 seconds of compressed body and room-depth capture",
    color: "#ef8fc5",
    defaultPayloadBits: DEFAULT_PAYLOAD_BITS.pointCloud
  }
];

export const PRESENCE_BY_ID = PRESENCE_FORMS.reduce(
  (forms, form) => ({ ...forms, [form.id]: form }),
  {} as Record<PresenceFormId, PresenceFormDefinition>
);

export const VISIBILITY_SECONDS: Record<PresenceFormId, number> = {
  voice: 3.2,
  expression: 6.5,
  pointCloud: 9
};

export const createPresenceOffsets = () =>
  PRESENCE_SEQUENCE.reduce(
    (offsets, form, index) => ({
      ...offsets,
      [form]: index * PRESENCE_STAGGER_SECONDS
    }),
    {} as Partial<Record<PresenceFormId, number>>
  );
