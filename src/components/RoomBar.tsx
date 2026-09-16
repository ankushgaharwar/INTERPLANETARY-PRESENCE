import { Check, Copy, LogOut, Radio, UsersRound } from "lucide-react";
import { useState } from "react";
import { STATION_BY_ID } from "../realtime/stations";
import type {
  RoomConnectionStatus,
  RoomPeer,
  RoomSession
} from "../realtime/types";

interface RoomBarProps {
  session: RoomSession;
  peers: RoomPeer[];
  status: RoomConnectionStatus;
  transport: "hosted" | "local";
  onLeave: () => void;
}

export function RoomBar({
  session,
  peers,
  status,
  transport,
  onLeave
}: RoomBarProps) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set("room", session.roomCode);
  const hostStation =
    peers.find((peer) => peer.role === "father")?.station ??
    (session.role === "father" ? session.station : undefined);
  if (hostStation) {
    inviteUrl.searchParams.set("station", hostStation);
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="room-bar" aria-label="Shared room status">
      <div className="room-identity">
        <span className={`connection-dot is-${status}`} aria-hidden="true" />
        <div>
          <small>{transport === "hosted" ? "Live room" : "Local room"}</small>
          <strong>{session.roomCode}</strong>
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
        <button type="button" onClick={copyInvite}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy invite"}
        </button>
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
