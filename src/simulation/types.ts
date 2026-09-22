export type Participant = "daughter" | "father";

export type PresenceFormId = "text" | "voice" | "expression" | "pointCloud";

export type TransmissionState =
  | "queued"
  | "travelling"
  | "arrived"
  | "decoding"
  | "visible"
  | "expired";

export interface ConversationMessage {
  id: string;
  sentAt: number;
  sender: Participant;
  text: string;
  action: string;
  presenceForms?: PresenceFormId[];
  presenceFormOffsets?: Partial<Record<PresenceFormId, number>>;
}

export interface PresenceFormDefinition {
  id: PresenceFormId;
  label: string;
  shortLabel: string;
  principle: string;
  assumption: string;
  color: string;
  defaultPayloadBits: number;
}

export interface ScientificSettings {
  earthMoonDistanceMeters: number;
  speedOfLightMetersPerSecond: number;
  linkRateMbps: number;
  pointCloudReconstructionSeconds: number;
  payloadBits: Record<PresenceFormId, number>;
}

export interface TransmissionEvent {
  id: string;
  messageId: string;
  messageIndex: number;
  sender: Participant;
  recipient: Participant;
  text: string;
  action: string;
  presenceForm: PresenceFormId;
  presenceLabel: string;
  payloadBits: number;
  captureTime: number;
  sentAt: number;
  propagationTime: number;
  transmissionTime: number;
  networkArrivalTime: number;
  renderReadyAt: number;
  reconstructionTime: number;
}

export interface TransmissionSnapshot {
  event: TransmissionEvent;
  state: TransmissionState;
  progress: number;
  visibleProgress: number;
  fadeProgress: number;
}
