import type { Participant } from "../simulation/types";

export type StationId = "earth" | "moon" | "spaceStation";
export type AvatarId = "atlas" | "nova" | "sol";

export interface RoomSession {
  roomCode: string;
  clientId: string;
  displayName: string;
  station: StationId;
  avatar: AvatarId;
  role: Participant;
}

export interface RoomPeer extends RoomSession {
  joinedAt: string;
}

export interface OpenLobby {
  roomCode: string;
  hostClientId: string;
  hostName: string;
  hostStation: StationId;
  hostAvatar: AvatarId;
  advertisedAt: number;
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

export type RoomConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
