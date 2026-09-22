import { ArrowRight, Plus, Radio, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { realtimeConfig } from "../realtime/config";
import { STATIONS } from "../realtime/stations";
import type { RoomSession, StationId } from "../realtime/types";

interface RoomLobbyProps {
  onEnter: (session: RoomSession) => void;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const createRoomCode = () => {
  const values = crypto.getRandomValues(new Uint8Array(8));
  return [...values]
    .map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length])
    .join("");
};

const cleanRoomCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

export function RoomLobby({ onEnter }: RoomLobbyProps) {
  const initialRoomCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return cleanRoomCode(params.get("room") ?? "");
  }, []);
  const [displayName, setDisplayName] = useState(
    () => window.localStorage.getItem("presence-display-name") ?? ""
  );
  const [station, setStation] = useState<StationId>("earth");
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [error, setError] = useState("");

  const enterRoom = (role: RoomSession["role"], code: string) => {
    const name = displayName.trim();
    if (!name) {
      setError("Enter your name to continue.");
      return;
    }
    if (!code) {
      setError("Enter a room code to join.");
      return;
    }

    window.localStorage.setItem("presence-display-name", name);
    setError("");
    onEnter({
      roomCode: code,
      clientId: crypto.randomUUID(),
      displayName: name,
      station,
      role
    });
  };

  return (
    <main className="lobby-shell">
      <header className="lobby-header">
        <div className="brand-block">
          <p>Interplanetary Presence</p>
          <h1>Shared Presence Room</h1>
        </div>
        <div className={`network-mode ${realtimeConfig.hosted ? "is-live" : ""}`}>
          <Radio aria-hidden="true" />
          <span>{realtimeConfig.hosted ? "Online rooms" : "Local preview"}</span>
        </div>
      </header>

      <section className="room-entry" aria-labelledby="room-entry-title">
        <div className="entry-heading">
          <p className="eyebrow">join a shared spatial session</p>
          <h2 id="room-entry-title">Choose your station</h2>
        </div>

        <div className="station-picker" role="radiogroup" aria-label="Station">
          {STATIONS.map(({ id, label, detail, icon: Icon }) => (
            <button
              key={id}
              className={station === id ? "is-selected" : ""}
              type="button"
              role="radio"
              aria-checked={station === id}
              onClick={() => setStation(id)}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
            </button>
          ))}
        </div>

        <form
          className="room-form"
          onSubmit={(event) => {
            event.preventDefault();
            enterRoom("daughter", roomCode);
          }}
        >
          <label>
            <span>Your name</span>
            <input
              value={displayName}
              maxLength={32}
              autoComplete="name"
              placeholder="Name"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            <span>Room code</span>
            <input
              value={roomCode}
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="8-character code"
              onChange={(event) => setRoomCode(cleanRoomCode(event.target.value))}
            />
          </label>

          {error ? <p className="room-error" role="alert">{error}</p> : null}

          <div className="room-actions">
            <button
              className="create-room"
              type="button"
              onClick={() => enterRoom("father", createRoomCode())}
            >
              <Plus aria-hidden="true" />
              Create room
            </button>
            <button className="join-room" type="submit" disabled={!roomCode}>
              <UsersRound aria-hidden="true" />
              Join room
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
