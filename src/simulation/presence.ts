import { DEFAULT_PAYLOAD_BITS } from "./constants";
import type { PresenceFormDefinition, PresenceFormId } from "./types";

export const PRESENCE_SEQUENCE: PresenceFormId[] = [
  "text",
  "voice",
  "expression",
  "pointCloud"
];

export const PRESENCE_STAGGER_SECONDS = 0.75;
export const TURN_RESPONSE_GAP_SECONDS = 0.85;

export const PRESENCE_FORMS: PresenceFormDefinition[] = [
  {
    id: "text",
    label: "Text message",
    shortLabel: "Text",
    principle: "Read the message as soon as it arrives",
    assumption: "Up to 280 UTF-8 characters",
    color: "#b9c3d1",
    defaultPayloadBits: DEFAULT_PAYLOAD_BITS.text
  },
  {
    id: "voice",
    label: "Generated voice",
    shortLabel: "Audio",
    principle: "Hear the same message as synthesized speech",
    assumption: "Text-to-speech spatial audio",
    color: "#8fdcff",
    defaultPayloadBits: DEFAULT_PAYLOAD_BITS.voice
  },
  {
    id: "expression",
    label: "Expression, motion & intent",
    shortLabel: "Motion",
    principle: "Read gaze, affect, gesture and intent",
    assumption: "Face blendshapes, skeletal motion and intent metadata",
    color: "#ffd36a",
    defaultPayloadBits: DEFAULT_PAYLOAD_BITS.expression
  },
  {
    id: "pointCloud",
    label: "Point cloud",
    shortLabel: "Point cloud",
    principle: "Rebuild the moving body, furniture and surrounding space",
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
  text: 2.5,
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
