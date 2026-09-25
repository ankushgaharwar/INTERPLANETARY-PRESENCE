import { ArrowLeft, ArrowRight, Plus, Radio, RefreshCw, UsersRound } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { AVATAR_BY_ID, AVATARS } from "../realtime/avatars";
import { realtimeConfig } from "../realtime/config";
import { STATION_BY_ID, STATIONS } from "../realtime/stations";
import type {
  OpenLobby,
  AvatarId,
  RoomConnectionStatus,
  RoomSession,
  StationId
} from "../realtime/types";

interface RoomLobbyProps {
  lobbies: OpenLobby[];
  directoryStatus: RoomConnectionStatus;
  onRefresh?: () => void;
  onEnter: (session: RoomSession) => void;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const createRoomCode = () => {
  const values = crypto.getRandomValues(new Uint8Array(8));
  return [...values]
    .map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length])
    .join("");
};

const colorHex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

const avatarStyle = (avatarId: AvatarId) => {
  const avatar = AVATAR_BY_ID[avatarId];
  return {
    "--avatar-skin": colorHex(avatar.skin),
    "--avatar-hair": colorHex(avatar.hair),
    "--avatar-accent": colorHex(avatar.accent)
  } as CSSProperties;
};

export function RoomLobby({
  lobbies,
  directoryStatus,
  onRefresh,
  onEnter
}: RoomLobbyProps) {
  const [displayName, setDisplayName] = useState(
    () => window.localStorage.getItem("presence-display-name") ?? ""
  );
  const [station, setStation] = useState<StationId>("earth");
  const [avatar, setAvatar] = useState<AvatarId>("atlas");
  const [error, setError] = useState("");
  const [selectedLobby, setSelectedLobby] = useState<OpenLobby | null>(null);
  const entryRef = useRef<HTMLHeadingElement>(null);
  const selectedIsOpen = !selectedLobby || lobbies.some((lobby) =>
    lobby.roomCode === selectedLobby.roomCode && lobby.hostClientId === selectedLobby.hostClientId);

  const enterRoom = (role: RoomSession["role"], roomCode: string) => {
    if (directoryStatus !== "connected") {
      setError("The lobby service is reconnecting. Please try again when it is online.");
      return;
    }
    if (role === "daughter" && (!selectedLobby || !selectedIsOpen)) {
      setError("This lobby is no longer available. Choose another open lobby.");
      return;
    }
    if (role === "daughter" && (station === selectedLobby?.hostStation || avatar === selectedLobby?.hostAvatar)) {
      setError("Choose an available location and avatar.");
      return;
    }
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
      avatar,
      role
    });
  };

  const joinLobby = (lobby: OpenLobby) => {
    setSelectedLobby(lobby);
    if (station === lobby.hostStation) setStation(STATIONS.find((option) => option.id !== lobby.hostStation)!.id);
    if (avatar === lobby.hostAvatar) setAvatar(AVATARS.find((option) => option.id !== lobby.hostAvatar)!.id);
    setError("");
    entryRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    entryRef.current?.focus();
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
                : "Internet lobbies live"
              : directoryStatus === "error"
                ? "Lobby directory unavailable"
                : "Finding open lobbies"}
          </span>
        </div>
      </header>

      <section className="room-entry" aria-labelledby="room-entry-title">
        <div className="entry-heading">
          <p className="eyebrow">two-person spatial session</p>
          <h2 ref={entryRef} tabIndex={-1} id="room-entry-title">
            {selectedLobby ? `Join ${selectedLobby.hostName}'s lobby` : "Create or join an open lobby"}
          </h2>
          {selectedLobby ? (
            <div className="join-host-summary">
              <button type="button" className="icon-button" title="Back to create a lobby"
                aria-label="Cancel joining" onClick={() => { setSelectedLobby(null); setError(""); }}>
                <ArrowLeft aria-hidden="true" />
              </button>
              <span>{selectedLobby.hostName} · {STATION_BY_ID[selectedLobby.hostStation].label} · {AVATAR_BY_ID[selectedLobby.hostAvatar].label}</span>
            </div>
          ) : null}
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
              className={selectedLobby?.hostStation === id ? "is-taken" : station === id ? "is-selected" : ""}
              type="button"
              role="radio"
              aria-checked={station === id}
              disabled={selectedLobby?.hostStation === id}
              onClick={() => {
                setStation(id);
                setError("");
              }}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{label}</strong>
                <small>{selectedLobby?.hostStation === id ? "Selected by host" : detail}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="entry-section-heading">
          <span>Your avatar</span>
          <strong>{AVATAR_BY_ID[avatar].label}</strong>
        </div>

        <div className="avatar-picker" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((option) => (
            <button
              key={option.id}
              className={selectedLobby?.hostAvatar === option.id ? "is-taken" : avatar === option.id ? "is-selected" : ""}
              type="button"
              role="radio"
              aria-checked={avatar === option.id}
              aria-label={`${option.label}, ${selectedLobby?.hostAvatar === option.id ? "Selected by host" : option.detail}`}
              disabled={selectedLobby?.hostAvatar === option.id}
              onClick={() => {
                setAvatar(option.id);
                setError("");
              }}
            >
              <span
                className="avatar-preview"
                style={avatarStyle(option.id)}
                aria-hidden="true"
              >
                <i />
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{selectedLobby?.hostAvatar === option.id ? "Selected by host" : option.detail}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="create-lobby-row">
          <div>
            <strong>{selectedLobby ? "Join" : "Host"} from {STATION_BY_ID[station].label}</strong>
            <small>{selectedLobby ? `${AVATAR_BY_ID[avatar].label} · ${selectedIsOpen ? "One place available" : "Lobby no longer available"}` : "Your name and location will appear in the public lobby list."}</small>
          </div>
          <button
            className="enter-room"
            type="button"
            disabled={directoryStatus !== "connected" || !selectedIsOpen}
            onClick={() => selectedLobby ? enterRoom("daughter", selectedLobby.roomCode) : enterRoom("father", createRoomCode())}
          >
            {selectedLobby ? <UsersRound aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {selectedLobby ? "Join lobby" : "Create open lobby"}
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
            <div className="directory-actions">
              <span>{lobbies.length} waiting</span>
              <button className="icon-button" type="button" title="Refresh open lobbies"
                aria-label="Refresh open lobbies" onClick={onRefresh}>
                <RefreshCw aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="open-lobby-list" aria-live="polite">
            {lobbies.length === 0 ? (
              <p className="empty-lobbies">
                {directoryStatus === "error" || directoryStatus === "disconnected"
                  ? "Cannot reach the online lobby service. Check your connection and refresh."
                  : directoryStatus === "connecting"
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
                      <strong className="lobby-host-name">
                        <span
                          className="avatar-preview is-small"
                          style={avatarStyle(lobby.hostAvatar)}
                          aria-hidden="true"
                        >
                          <i />
                        </span>
                        {lobby.hostName}
                      </strong>
                      <span>
                        Hosting from {stationInfo.label} · {stationInfo.detail}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={directoryStatus !== "connected"}
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
