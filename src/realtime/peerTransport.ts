import type { JoinRoomConfig } from "@trystero-p2p/mqtt";

export const PEER_APP_CONFIG: JoinRoomConfig = {
  appId: "interplanetary-presence-github-pages-v1",
  relayConfig: {
    redundancy: 3,
    warnOnRelayFailure: false
  }
};

export const PEER_DIRECTORY_ROOM = "open-lobby-directory-v1";

export const getPeerRoomName = (roomCode: string) =>
  `presence-room-${roomCode.toLowerCase()}`;
