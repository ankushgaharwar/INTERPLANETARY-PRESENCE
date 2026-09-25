import { createReferenceSettings } from "./constants";
import { conversation as defaultConversation } from "./conversation";
import {
  createPresenceOffsets,
  PRESENCE_BY_ID,
  PRESENCE_FORMS,
  PRESENCE_SEQUENCE,
  VISIBILITY_SECONDS
} from "./presence";
import { clamp } from "./format";
import type {
  ConversationMessage,
  PresenceFormId,
  ScientificSettings,
  TransmissionEvent,
  TransmissionSnapshot,
  TransmissionState
} from "./types";

const ARRIVED_STATE_SECONDS = 0.22;

const calculateTextPayloadBits = (text: string) =>
  Math.max(8, new TextEncoder().encode(text).byteLength * 8);

export const calculatePropagationTime = (
  distanceMeters: number,
  speedMetersPerSecond: number
) => {
  if (distanceMeters < 0) {
    throw new Error("Distance must be zero or greater.");
  }

  if (speedMetersPerSecond <= 0) {
    throw new Error("Signal speed must be greater than zero.");
  }

  return distanceMeters / speedMetersPerSecond;
};

export const calculateTransmissionTime = (
  payloadSizeBits: number,
  linkRateMbps: number
) => {
  if (payloadSizeBits < 0) {
    throw new Error("Payload size must be zero or greater.");
  }

  if (linkRateMbps <= 0) {
    throw new Error("Link rate must be greater than zero.");
  }

  return payloadSizeBits / (linkRateMbps * 1_000_000);
};

export const calculateArrivalOffset = (
  payloadSizeBits: number,
  settings: ScientificSettings
) =>
  calculatePropagationTime(
    settings.earthMoonDistanceMeters,
    settings.speedOfLightMetersPerSecond
  ) + calculateTransmissionTime(payloadSizeBits, settings.linkRateMbps);

export const getRecipient = (sender: "daughter" | "father") =>
  sender === "daughter" ? "father" : "daughter";

export const buildTransmissionEvents = (
  messages: ConversationMessage[],
  settings: ScientificSettings
): TransmissionEvent[] => {
  const propagationTime = calculatePropagationTime(
    settings.earthMoonDistanceMeters,
    settings.speedOfLightMetersPerSecond
  );

  const events = messages.flatMap((message, messageIndex) => {
      const messageForms = message.presenceForms
        ? PRESENCE_FORMS.filter((form) =>
            message.presenceForms?.includes(form.id)
          )
        : PRESENCE_FORMS;
      const offsets = message.presenceFormOffsets ?? createPresenceOffsets();
      const captureTime = message.sentAt;

      const turnEvents = messageForms.map((form) => {
        const sentAt = captureTime + (offsets[form.id] ?? 0);
        const payloadBits =
          form.id === "text"
            ? calculateTextPayloadBits(message.text)
            : settings.payloadBits[form.id];
        const transmissionTime = calculateTransmissionTime(
          payloadBits,
          settings.linkRateMbps
        );
        const networkArrivalTime =
          sentAt + propagationTime + transmissionTime;
        const reconstructionTime =
          form.id === "pointCloud"
            ? settings.pointCloudReconstructionSeconds
            : 0;

        return {
          id: `${message.id}-${form.id}`,
          messageId: message.id,
          messageIndex,
          sender: message.sender,
          recipient: getRecipient(message.sender),
          text: message.text,
          action: message.action,
          presenceForm: form.id,
          presenceLabel: form.label,
          payloadBits,
          captureTime,
          sentAt,
          propagationTime,
          transmissionTime,
          networkArrivalTime,
          renderReadyAt: networkArrivalTime + reconstructionTime,
          reconstructionTime
        } satisfies TransmissionEvent;
      });

      return turnEvents;
    });

  return events.sort((a, b) => {
      if (a.sentAt !== b.sentAt) {
        return a.sentAt - b.sentAt;
      }

      if (a.renderReadyAt !== b.renderReadyAt) {
        return a.renderReadyAt - b.renderReadyAt;
      }

      return PRESENCE_SEQUENCE.indexOf(a.presenceForm) -
        PRESENCE_SEQUENCE.indexOf(b.presenceForm);
    });
};

export const getVisibleStart = (event: TransmissionEvent) => event.renderReadyAt;

export const getCompleteDeliveryTime = (event: TransmissionEvent) =>
  event.presenceForm === "pointCloud"
    ? event.renderReadyAt
    : event.networkArrivalTime;

export const getTransmissionState = (
  event: TransmissionEvent,
  simulationTime: number
): TransmissionState => {
  const visibilityEnd =
    getVisibleStart(event) + VISIBILITY_SECONDS[event.presenceForm];

  if (simulationTime < event.sentAt) {
    return "queued";
  }

  if (simulationTime < event.networkArrivalTime) {
    return "travelling";
  }

  if (
    event.presenceForm === "pointCloud" &&
    simulationTime < event.renderReadyAt
  ) {
    return "decoding";
  }

  if (simulationTime < event.renderReadyAt + ARRIVED_STATE_SECONDS) {
    return "arrived";
  }

  if (simulationTime <= visibilityEnd) {
    return "visible";
  }

  return "expired";
};

export const getSnapshot = (
  event: TransmissionEvent,
  simulationTime: number
): TransmissionSnapshot => {
  const totalTravel = event.networkArrivalTime - event.sentAt;
  const progress =
    totalTravel <= 0
      ? 1
      : clamp((simulationTime - event.sentAt) / totalTravel);
  const visibleStart = getVisibleStart(event);
  const visibleFor = VISIBILITY_SECONDS[event.presenceForm];
  const visibleProgress = clamp((simulationTime - visibleStart) / visibleFor);

  return {
    event,
    state: getTransmissionState(event, simulationTime),
    progress,
    visibleProgress,
    fadeProgress: visibleProgress
  };
};

export const getSnapshots = (
  events: TransmissionEvent[],
  simulationTime: number
) => events.map((event) => getSnapshot(event, simulationTime));

export const getActivePacketSnapshots = (
  events: TransmissionEvent[],
  simulationTime: number
) =>
  getSnapshots(events, simulationTime).filter(({ state, event }) => {
    if (state === "queued") {
      return simulationTime >= event.sentAt - 0.35;
    }

    return state !== "expired";
  });

export const getVisibleRepresentationSnapshots = (
  events: TransmissionEvent[],
  simulationTime: number,
  recipient: "daughter" | "father"
) =>
  getSnapshots(events, simulationTime).filter(({ event, state }) => {
    if (event.recipient !== recipient) {
      return false;
    }

    if (event.presenceForm === "pointCloud") {
      return state === "decoding" || state === "arrived" || state === "visible";
    }

    return state === "arrived" || state === "visible";
  });

export const countSignalsInTransit = (
  events: TransmissionEvent[],
  simulationTime: number
) =>
  events.filter((event) => {
    const state = getTransmissionState(event, simulationTime);
    return state === "travelling" || state === "decoding";
  }).length;

export const countOverlappingRepresentations = (
  events: TransmissionEvent[],
  simulationTime: number
) =>
  getSnapshots(events, simulationTime).filter(({ state }) =>
    ["arrived", "decoding", "visible"].includes(state)
  ).length;

export const getNextEventTime = (
  events: TransmissionEvent[],
  simulationTime: number
) => {
  const times = [
    ...events.flatMap((event) => [
      event.captureTime,
      event.sentAt,
      event.networkArrivalTime,
      ...(event.presenceForm === "pointCloud" ? [event.renderReadyAt] : [])
    ])
  ]
    .filter((time) => time > simulationTime + 0.01)
    .sort((a, b) => a - b);

  return times[0] ?? simulationTime;
};

export class SignalEngine {
  private messages: ConversationMessage[];
  private settings: ScientificSettings;
  private events: TransmissionEvent[];

  constructor(
    settings: ScientificSettings = createReferenceSettings(),
    messages: ConversationMessage[] = defaultConversation
  ) {
    this.messages = messages;
    this.settings = settings;
    this.events = buildTransmissionEvents(messages, settings);
  }

  getEvents() {
    return [...this.events];
  }

  getSettings() {
    return {
      ...this.settings,
      payloadBits: { ...this.settings.payloadBits }
    };
  }

  updateSettings(settings: ScientificSettings) {
    this.settings = settings;
    this.events = buildTransmissionEvents(this.messages, settings);
  }

  reset() {
    this.events = buildTransmissionEvents(this.messages, this.settings);
  }

  getFormDefinition(id: PresenceFormId) {
    return PRESENCE_BY_ID[id];
  }
}
