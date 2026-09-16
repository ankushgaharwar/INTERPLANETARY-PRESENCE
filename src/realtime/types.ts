import type { Participant } from "../simulation/types";

export type StationId = "earth" | "moon" | "spaceStation";

export interface RoomSession {
  roomCode: string;
  clientId: string;
  displayName: string;
  station: StationId;
  role: Participant;
}

export interface RoomPeer extends RoomSession {
  joinedAt: string;
}

export interface RoomMessage {
  id: string;
  roomCode: string;
  senderId: string;
  senderName: string;
  senderRole: Participant;
  senderStation: StationId;
  text: string;
  sentAt: number;
}

export type MediaSignalKind =
  | "media-ready"
  | "offer"
  | "answer"
  | "candidate";

export interface MediaSignal {
  id: string;
  roomCode: string;
  senderId: string;
  targetId?: string;
  kind: MediaSignalKind;
  sentAt: number;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export type OutgoingMediaSignal = Omit<
  MediaSignal,
  "id" | "roomCode" | "senderId" | "sentAt"
>;

export type RoomConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
