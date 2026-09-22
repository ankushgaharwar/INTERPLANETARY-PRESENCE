import { ArrowRight, Plus, Radio, UsersRound } from "lucide-react";
import { useState } from "react";
import { realtimeConfig } from "../realtime/config";
import { STATION_BY_ID, STATIONS } from "../realtime/stations";
import type {
  OpenLobby,
  RoomConnectionStatus,
  RoomSession,
  StationId
} from "../realtime/types";

interface RoomLobbyProps {
  lobbies: OpenLobby[];
  directoryStatus: RoomConnectionStatus;
  onEnter: (session: RoomSession) => void;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const createRoomCode = () => {
  const values = crypto.getRandomValues(new Uint8Array(8));
  return [...values]
    .map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length])
    .join("");
};

export function RoomLobby({
  lobbies,
  directoryStatus,
  onEnter
}: RoomLobbyProps) {
  const [displayName, setDisplayName] = useState(
    () => window.localStorage.getItem("presence-display-name") ?? ""
  );
  const [station, setStation] = useState<StationId>("earth");
  const [error, setError] = useState("");

  const enterRoom = (role: RoomSession["role"], roomCode: string) => {
    const name = displayName.trim();
    if (!name) {
      setError("Enter your name to continue.");
      return;
    }

    window.localStorage.setItem("presence-display-name", name);
    setError("");
    onEnter({
      roomCode,
      clientId: crypto.randomUUID(),
      displayName: name,
      station,
      role
    });
  };

  const joinLobby = (lobby: OpenLobby) => {
    enterRoom("daughter", lobby.roomCode);
  };

  return (
    <main className="lobby-shell">
      <header className="lobby-header">
        <div className="brand-block">
          <p>Interplanetary Presence</p>
          <h1>Earth · Moon · Space Station</h1>
        </div>
        <div
          className={`network-mode ${directoryStatus === "connected" ? "is-live" : ""}`}
        >
          <Radio aria-hidden="true" />
          <span>
            {directoryStatus === "connected"
              ? realtimeConfig.hosted
                ? "Open lobbies live"
                : "Browser lobbies live"
              : directoryStatus === "error"
                ? "Lobby directory unavailable"
                : "Finding open lobbies"}
          </span>
        </div>
      </header>

      <section className="room-entry" aria-labelledby="room-entry-title">
        <div className="entry-heading">
          <p className="eyebrow">two-person spatial session</p>
          <h2 id="room-entry-title">Create or join an open lobby</h2>
        </div>

        <label className="profile-name">
          <span>Your name</span>
          <input
            value={displayName}
            maxLength={32}
            autoComplete="name"
            placeholder="Name"
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError("");
            }}
          />
        </label>

        <div className="entry-section-heading">
          <span>Your location</span>
          <strong>{STATION_BY_ID[station].label}</strong>
        </div>

        <div className="station-picker" role="radiogroup" aria-label="Station">
          {STATIONS.map(({ id, label, detail, icon: Icon }) => (
            <button
              key={id}
              className={station === id ? "is-selected" : ""}
              type="button"
              role="radio"
              aria-checked={station === id}
              onClick={() => {
                setStation(id);
                setError("");
              }}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="create-lobby-row">
          <div>
            <strong>Host from {STATION_BY_ID[station].label}</strong>
            <small>Your name and location will appear below for others.</small>
          </div>
          <button
            className="enter-room"
            type="button"
            onClick={() => enterRoom("father", createRoomCode())}
          >
            <Plus aria-hidden="true" />
            Create open lobby
          </button>
        </div>

        {error ? (
          <p className="room-error" role="alert">
            {error}
          </p>
        ) : null}

        <section className="open-lobbies" aria-labelledby="open-lobbies-title">
          <header className="open-lobbies-heading">
            <div>
              <p className="eyebrow">available now</p>
              <h3 id="open-lobbies-title">Open lobbies</h3>
            </div>
            <span>{lobbies.length} waiting</span>
          </header>

          <div className="open-lobby-list" aria-live="polite">
            {lobbies.length === 0 ? (
              <p className="empty-lobbies">
                {directoryStatus === "connecting"
                  ? "Looking for hosts..."
                  : "No one is waiting yet. Create the first open lobby."}
              </p>
            ) : (
              lobbies.map((lobby) => {
                const stationInfo = STATION_BY_ID[lobby.hostStation];
                const StationIcon = stationInfo.icon;
                return (
                  <article className="open-lobby-row" key={lobby.roomCode}>
                    <span className="lobby-station-icon" aria-hidden="true">
                      <StationIcon />
                    </span>
                    <div className="open-lobby-copy">
                      <strong>{lobby.hostName}</strong>
                      <span>
                        Hosting from {stationInfo.label} · {stationInfo.detail}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => joinLobby(lobby)}
                    >
                      <UsersRound aria-hidden="true" />
                      Join
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
