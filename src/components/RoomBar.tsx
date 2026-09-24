import { LogOut, Radio, UsersRound } from "lucide-react";
import { STATION_BY_ID } from "../realtime/stations";
import type {
  RoomConnectionStatus,
  RoomPeer
} from "../realtime/types";

interface RoomBarProps {
  peers: RoomPeer[];
  status: RoomConnectionStatus;
  transport: "hosted" | "peer";
  onLeave: () => void;
}

export function RoomBar({
  peers,
  status,
  transport,
  onLeave
}: RoomBarProps) {
  return (
    <section className="room-bar" aria-label="Shared room status">
      <div className="room-identity">
        <span className={`connection-dot is-${status}`} aria-hidden="true" />
        <div>
          <small>
            {transport === "hosted" ? "Live lobby" : "Peer-to-peer lobby"}
          </small>
          <strong>{peers.length < 2 ? "Open for one person" : "Shared session"}</strong>
        </div>
      </div>

      <div className="room-peers" aria-label={`${peers.length} people connected`}>
        <UsersRound aria-hidden="true" />
        {peers.slice(0, 2).map((peer) => (
          <span key={peer.clientId}>
            <strong>{peer.displayName}</strong>
            <small>{STATION_BY_ID[peer.station].label}</small>
          </span>
        ))}
        {peers.length < 2 ? <em>Waiting for one person</em> : null}
      </div>

      <div className="room-bar-actions">
        <button type="button" onClick={onLeave}>
          <LogOut aria-hidden="true" />
          Leave
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {status === "connected" ? "Room connected" : "Room connection changing"}
      </span>
      <Radio className="room-signal" aria-hidden="true" />
    </section>
  );
}
